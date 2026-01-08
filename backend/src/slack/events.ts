import { Router, type Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { AppDataSource } from '../db/data-source';
import { SlackUserMapping } from '../db/entities/SlackUserMapping';
import { processSlackMessage } from './agent';

interface SlackRequest extends Request {
    rawBody: string;
}

const router = Router();

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';

function verifySlackRequest(req: SlackRequest): boolean {
    const slackSignature = req.headers['x-slack-signature'] as string;
    const slackTimestamp = req.headers['x-slack-request-timestamp'] as string;
    const body = req.rawBody;

    if (!slackSignature || !slackTimestamp || !body) {
        return false;
    }

    const timestamp = parseInt(slackTimestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestamp) > 60 * 5) {
        return false;
    }

    const sigBasestring = `v0:${slackTimestamp}:${body}`;
    const mySignature = 'v0=' + createHmac('sha256', SLACK_SIGNING_SECRET).update(sigBasestring).digest('hex');

    try {
        const slackSigBuffer = Buffer.from(slackSignature);
        const mySigBuffer = Buffer.from(mySignature);

        if (slackSigBuffer.length !== mySigBuffer.length) {
            return false;
        }

        return timingSafeEqual(slackSigBuffer, mySigBuffer);
    } catch {
        return false;
    }
}

router.post('/events', async (req, res) => {
    const slackReq = req as SlackRequest;
    if (!verifySlackRequest(slackReq)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    let body;
    try {
        body = JSON.parse(slackReq.rawBody);
    } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
    }

    const eventSchema = z.object({
        type: z.string(),
        token: z.string().optional(),
        challenge: z.string().optional(),
        event: z
            .object({
                type: z.string(),
                user: z.string(),
                text: z.string(),
                channel: z.string(),
                ts: z.string(),
                team: z.string().optional(),
            })
            .optional(),
        team_id: z.string().optional(),
    });

    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid event payload' });
    }

    const { type, challenge, event, team_id } = parsed.data;

    if (type === 'url_verification') {
        return res.json({ challenge });
    }

    if (type === 'event_callback' && event?.type === 'app_mention') {
        const teamId = event.team || team_id;
        if (!teamId) {
            return res.status(400).json({ error: 'Missing team_id' });
        }

        const mappingRepository = AppDataSource.getRepository(SlackUserMapping);
        const mapping = await mappingRepository.findOne({
            where: { slackTeamId: teamId, slackUserId: event.user },
        });

        if (!mapping) {
            return res.status(200).json({ ok: true });
        }

        setImmediate(() => {
            processSlackMessage({
                userId: mapping.codeeUserId,
                channel: event.channel,
                text: event.text,
                messageTs: event.ts,
            }).catch((error) => {
                console.error('Failed to process Slack message:', error);
            });
        });

        return res.status(200).json({ ok: true });
    }

    res.status(200).json({ ok: true });
});

export const slackEventsRouter = router;
