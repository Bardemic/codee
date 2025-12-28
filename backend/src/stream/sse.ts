import express from 'express';
import Redis from 'ioredis';
import { getChannelName, readHistorySince, type AgentEventEnvelope } from './events';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379/0';

export const sseRouter = express.Router();

sseRouter.get('/agent/:agentId', async (req, res) => {
    const agentId = Number(req.params.agentId);
    if (Number.isNaN(agentId)) {
        res.status(400).json({ error: 'invalid agent id' });
        return;
    }

    const lastEventIdHeader = req.header('last-event-id');
    const lastEventIdQuery = typeof req.query.last_event_id === 'string' ? req.query.last_event_id : undefined;
    const lastEventIdRaw = lastEventIdQuery || lastEventIdHeader || '0';

    const skipBacklog = lastEventIdRaw === '$';
    let lastProcessedId = skipBacklog ? 0 : Number.parseInt(lastEventIdRaw, 10) || 0;

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (agentEvent: AgentEventEnvelope) => {
        res.write(`id: ${agentEvent.id}\n`);
        res.write(`event: ${agentEvent.event}\n`);
        res.write(`data: ${JSON.stringify(agentEvent)}\n\n`);
    };

    let closed = false;
    let historyLoaded = false;
    const bufferedEvents: AgentEventEnvelope[] = [];
    const channelName = getChannelName(agentId);
    const subscriber = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    });

    const cleanup = async () => {
        if (closed) return;
        closed = true;
        try {
            await subscriber.unsubscribe(channelName);
        } catch {
            //
        }
        subscriber.disconnect();
        res.end();
    };

    const processEvent = (agentEvent: AgentEventEnvelope) => {
        if (closed) return;
        if (agentEvent.id <= lastProcessedId) return;
        lastProcessedId = agentEvent.id;
        sendEvent(agentEvent);
        if (agentEvent.event === 'done') {
            cleanup();
        }
    };

    req.on('close', cleanup);

    try {
        subscriber.on('error', (error) => {
            console.warn('sse subscriber error', error);
        });
        subscriber.on('message', (_channel, rawMessage) => {
            try {
                const agentEvent = JSON.parse(rawMessage) as AgentEventEnvelope;
                if (historyLoaded) {
                    processEvent(agentEvent);
                } else {
                    bufferedEvents.push(agentEvent);
                }
            } catch (error) {
                console.warn('sse message parse error', error);
            }
        });
        await subscriber.subscribe(channelName);
    } catch (error) {
        console.warn('sse subscribe error', error);
        await cleanup();
        return;
    }

    if (!skipBacklog) {
        try {
            const historyEvents = await readHistorySince(agentId, lastProcessedId);
            for (const agentEvent of historyEvents) {
                processEvent(agentEvent);
            }
        } catch (error) {
            console.warn('sse history error', error);
        }
    }

    historyLoaded = true;
    for (const agentEvent of bufferedEvents) {
        processEvent(agentEvent);
    }
    bufferedEvents.length = 0;
});
