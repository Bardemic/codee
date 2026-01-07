import { Router } from 'express';
import axios from 'axios';
import { z } from 'zod';
import { AppDataSource } from '../db/data-source';
import { IntegrationConnection } from '../db/entities/IntegrationConnection';
import { IntegrationProvider } from '../db/entities/IntegrationProvider';
import { SlackUserMapping } from '../db/entities/SlackUserMapping';
import { auth } from '../auth/auth';
import { fromNodeHeaders } from 'better-auth/node';

const router = Router();

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || '';
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || '';
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI || 'http://localhost:5001/api/slack/oauth/callback';

router.get('/oauth', async (req, res) => {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const state = Buffer.from(JSON.stringify({ userId: session.user.id })).toString('base64');

    const authUrl = new URL('https://slack.com/oauth/v2/authorize');
    authUrl.searchParams.set('client_id', SLACK_CLIENT_ID);
    authUrl.searchParams.set('scope', 'chat:write,app_mentions:read,users:read');
    authUrl.searchParams.set('redirect_uri', SLACK_REDIRECT_URI);
    authUrl.searchParams.set('state', state);

    res.redirect(authUrl.toString());
});

router.get('/oauth/callback', async (req, res) => {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
        return res.status(400).json({ error: 'Missing code or state' });
    }

    let userId: string;
    try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        userId = decoded.userId;
    } catch {
        return res.status(400).json({ error: 'Invalid state' });
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

        const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
        let connection = await connectionRepository.findOne({
            where: { userId, provider: { id: slackProvider.id } },
            relations: ['provider'],
        });

        if (!connection) {
            connection = connectionRepository.create({
                userId,
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

        res.redirect('http://localhost:5173/integrations?slack=success');
    } catch (error) {
        console.error('Slack OAuth callback error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export const slackOAuthRouter = router;
