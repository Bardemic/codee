import express from 'express';
import { getRedis } from '../utils/redis';

export const sseRouter = express.Router();

sseRouter.get('/agent/:agentId', async (req, res) => {
    const agentId = Number(req.params.agentId);
    if (Number.isNaN(agentId)) {
        res.status(400).json({ error: 'invalid agent id' });
        return;
    }

    const redisClient = getRedis();
    const lastEventIdParam = req.query.last_event_id;
    const baseId = typeof lastEventIdParam === 'string' ? lastEventIdParam : '0-0';
    let lastId = baseId;
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: string, data: unknown, id?: string) => {
        if (id) res.write(`id: ${id}\n`);
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let closed = false;
    req.on('close', () => {
        closed = true;
    });

    while (!closed) {
        try {
            const streamResponse = await redisClient.xread('BLOCK', 30000, 'STREAMS', `stream:agent:${agentId}`, lastId);

            if (!streamResponse) continue;

            for (const [, messages] of streamResponse) {
                for (const [messageId, fields] of messages) {
                    lastId = messageId;
                    const payload: Record<string, unknown> = {};
                    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 2) {
                        payload[String(fields[fieldIndex])] = fields[fieldIndex + 1];
                    }
                    const eventType = typeof payload.event === 'string' ? payload.event : 'message';
                    send(eventType, payload, messageId);
                    if (eventType === 'done') {
                        closed = true;
                        break;
                    }
                }
            }
        } catch (error) {
            console.warn('sse loop error', error);
        }
    }
    res.end();
});
