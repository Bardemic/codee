import express from 'express';
import { readHistorySince, subscribeToAgentEvents, type AgentEventEnvelope } from './events';

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
    let unsubscribe = () => {};
    const cleanup = async () => {
        if (closed) return;
        closed = true;
        unsubscribe();
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

    unsubscribe = subscribeToAgentEvents(agentId, (agentEvent) => {
        if (historyLoaded) {
            processEvent(agentEvent);
        } else {
            bufferedEvents.push(agentEvent);
        }
    });

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
