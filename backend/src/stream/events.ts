import { getRedis } from '../utils/redis';

const HISTORY_MAX = 500;

export type AgentEventPayload = {
    event: 'status' | 'error' | 'done' | string;
    phase?: string;
    step?: string;
    detail?: string;
    code?: string;
    reason?: string;
    [key: string]: unknown;
};

export type AgentEventEnvelope = AgentEventPayload & {
    id: number;
    timestamp: number;
};

export function getChannelName(agentId: number) {
    return `agent:events:${agentId}`;
}

export async function publishAgentEvent(agentId: number, payload: AgentEventPayload): Promise<AgentEventEnvelope> {
    const redis = getRedis();
    const eventId = await redis.incr(`agent:seq:${agentId}`);
    const envelope: AgentEventEnvelope = { id: eventId, timestamp: Date.now(), ...payload };
    const serialized = JSON.stringify(envelope);
    const historyKey = `agent:history:${agentId}`;

    await redis.multi().rpush(historyKey, serialized).ltrim(historyKey, -HISTORY_MAX, -1).publish(getChannelName(agentId), serialized).exec();

    return envelope;
}

export async function emitStatus(agentId: number, phase: string, step?: string, detail?: string, extra?: Record<string, unknown>) {
    await publishAgentEvent(agentId, {
        event: 'status',
        phase,
        step: step ?? '',
        detail: detail ?? '',
        ...extra,
    });
}

export async function emitError(agentId: number, code: string, message: string, step?: string) {
    await publishAgentEvent(agentId, {
        event: 'error',
        code,
        detail: message,
        step: step ?? '',
    });
}

export async function emitDone(agentId: number, reason: string) {
    await publishAgentEvent(agentId, { event: 'done', reason });
}

export async function readHistorySince(agentId: number, afterEventId: number): Promise<AgentEventEnvelope[]> {
    const redis = getRedis();
    const historyItems = await redis.lrange(`agent:history:${agentId}`, 0, -1);
    const events: AgentEventEnvelope[] = [];

    for (const item of historyItems) {
        try {
            const parsed = JSON.parse(item) as AgentEventEnvelope;
            if (parsed.id > afterEventId) {
                events.push(parsed);
            }
        } catch {
            continue;
        }
    }

    return events;
}
