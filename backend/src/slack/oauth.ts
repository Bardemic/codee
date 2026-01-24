import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { z } from 'zod';
import { AppDataSource } from '../db/data-source';
import { IntegrationConnection } from '../db/entities/IntegrationConnection';
import { IntegrationProvider } from '../db/entities/IntegrationProvider';
import { SlackUserMapping } from '../db/entities/SlackUserMapping';
import { workos, COOKIE_NAME } from '../auth/auth';
import { getOrganizationIdByUserId } from '../services/organizationService';

const router = Router();

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || '';
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || '';
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || '3000'}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI || `${BACKEND_URL}/api/slack/oauth/callback`;
const SLACK_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SLACK_OAUTH_STATE_SECRET = process.env.SLACK_OAUTH_STATE_SECRET || process.env.WORKOS_COOKIE_PASSWORD || '';

type SlackOAuthState = {
    userId: string;
    nonce: string;
    issuedAt: number;
};

const signSlackState = (payload: SlackOAuthState) => {
    if (!SLACK_OAUTH_STATE_SECRET) {
        throw new Error('SLACK_OAUTH_STATE_SECRET is not set');
    }

    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', SLACK_OAUTH_STATE_SECRET).update(body).digest('base64url');
    return `${body}.${signature}`;
};

const verifySlackState = (state: string) => {
    if (!SLACK_OAUTH_STATE_SECRET) {
        return null;
    }

    const [body, signature] = state.split('.');
    if (!body || !signature) {
        return null;
    }

    const expected = crypto.createHmac('sha256', SLACK_OAUTH_STATE_SECRET).update(body).digest();
    const provided = Buffer.from(signature, 'base64url');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return null;
    }

    let payload: SlackOAuthState;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    } catch {
        return null;
    }

    if (!payload.userId || !payload.issuedAt || !payload.nonce) {
        return null;
    }

    if (Date.now() - payload.issuedAt > SLACK_OAUTH_STATE_TTL_MS) {
        return null;
    }

    return payload;
};

router.get('/oauth', async (req, res) => {
    const sealedSession = req.cookies[COOKIE_NAME];

    if (!sealedSession) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = workos.userManagement.loadSealedSession({
        sessionData: sealedSession,
        cookiePassword: process.env.WORKOS_COOKIE_PASSWORD!,
    });

    const authResult = await session.authenticate();

    if (!authResult.authenticated || !('user' in authResult)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = authResult.user;

    const state = signSlackState({
        userId: user.id,
        nonce: crypto.randomBytes(16).toString('base64url'),
        issuedAt: Date.now(),
    });

    const authUrl = new URL('https://slack.com/oauth/v2/authorize');
    authUrl.searchParams.set('client_id', SLACK_CLIENT_ID);
    authUrl.searchParams.set('scope', 'chat:write,app_mentions:read,users:read,reactions:write');
    authUrl.searchParams.set('redirect_uri', SLACK_REDIRECT_URI);
    authUrl.searchParams.set('state', state);

    res.redirect(authUrl.toString());
});

router.get('/oauth/callback', async (req, res) => {
    const sealedSession = req.cookies[COOKIE_NAME];

    if (!sealedSession) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = workos.userManagement.loadSealedSession({
        sessionData: sealedSession,
        cookiePassword: process.env.WORKOS_COOKIE_PASSWORD!,
    });

    const authResult = await session.authenticate();

    if (!authResult.authenticated || !('user' in authResult)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
        return res.status(400).json({ error: 'Missing code or state' });
    }

    const payload = verifySlackState(state);
    if (!payload) {
        return res.status(400).json({ error: 'Invalid state' });
    }

    const userId = payload.userId;
    if (userId !== authResult.user.id) {
        return res.status(403).json({ error: 'Invalid state for user' });
    }

    try {
        const tokenResponse = await axios.post(
            'https://slack.com/api/oauth.v2.access',
            new URLSearchParams({
                client_id: SLACK_CLIENT_ID,
                client_secret: SLACK_CLIENT_SECRET,
                code,
                redirect_uri: SLACK_REDIRECT_URI,
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }
        );

        const tokenSchema = z.object({
            ok: z.boolean(),
            access_token: z.string(),
            bot_user_id: z.string(),
            team: z.object({
                id: z.string(),
                name: z.string(),
            }),
            authed_user: z.object({
                id: z.string(),
            }),
        });

        const parsed = tokenSchema.safeParse(tokenResponse.data);
        if (!parsed.success || !parsed.data.ok) {
            console.error('Slack OAuth error:', tokenResponse.data);
            return res.status(400).json({ error: 'Failed to exchange code for token' });
        }

        const { access_token, team, authed_user, bot_user_id } = parsed.data;

        const providerRepository = AppDataSource.getRepository(IntegrationProvider);
        const slackProvider = await providerRepository.findOne({
            where: { slug: 'slack' },
        });

        if (!slackProvider) {
            return res.status(500).json({ error: 'Slack provider not found in database' });
        }

        const organizationId = await getOrganizationIdByUserId(userId);
        if (!organizationId) {
            return res.status(500).json({ error: 'User has no organization' });
        }

        const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
        let connection = await connectionRepository.findOne({
            where: { organizationId, provider: { id: slackProvider.id } },
            relations: ['provider'],
        });

        if (!connection) {
            connection = connectionRepository.create({
                organizationId,
                provider: slackProvider,
                externalId: team.id,
            });
        }

        connection.setDataConfig({
            access_token,
            team_id: team.id,
            team_name: team.name,
            bot_user_id,
        });

        await connectionRepository.save(connection);

        const mappingRepository = AppDataSource.getRepository(SlackUserMapping);
        let mapping = await mappingRepository.findOne({
            where: { slackTeamId: team.id, slackUserId: authed_user.id },
        });

        if (!mapping) {
            mapping = mappingRepository.create({
                slackTeamId: team.id,
                slackUserId: authed_user.id,
                codeeUserId: userId,
            });
        } else {
            mapping.codeeUserId = userId;
        }

        await mappingRepository.save(mapping);

        res.redirect(`${FRONTEND_URL}/integrations?slack=success`);
    } catch (error) {
        console.error('Slack OAuth callback error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export const slackOAuthRouter = router;
