const HISTORY_MAX = 500;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const IDLE_TTL_MS = 5 * 60 * 1000;

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

type AgentEventState = {
    nextId: number;
    history: AgentEventEnvelope[];
    listeners: Set<(event: AgentEventEnvelope) => void>;
    lastTouched: number;
};

const agentStreams = new Map<number, AgentEventState>();

const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [agentId, state] of agentStreams) {
        if (state.listeners.size > 0) continue;
        if (now - state.lastTouched < IDLE_TTL_MS) continue;
        agentStreams.delete(agentId);
    }
}, CLEANUP_INTERVAL_MS);
cleanupInterval.unref();

function getOrCreateState(agentId: number): AgentEventState {
    const now = Date.now();
    const existing = agentStreams.get(agentId);
    if (existing) {
        existing.lastTouched = now;
        return existing;
    }
    const state: AgentEventState = {
        nextId: 0,
        history: [],
        listeners: new Set(),
        lastTouched: now,
    };
    agentStreams.set(agentId, state);
    return state;
}

export async function publishAgentEvent(agentId: number, payload: AgentEventPayload): Promise<AgentEventEnvelope> {
    const state = getOrCreateState(agentId);
    const eventId = state.nextId + 1;
    state.nextId = eventId;
    const envelope: AgentEventEnvelope = { id: eventId, timestamp: Date.now(), ...payload };
    state.history.push(envelope);
    if (state.history.length > HISTORY_MAX) {
        state.history.splice(0, state.history.length - HISTORY_MAX);
    }
    for (const listener of state.listeners) {
        try {
            listener(envelope);
        } catch (error) {
            console.warn('agent event listener error', error);
        }
    }
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
    const state = agentStreams.get(agentId);
    if (!state) return [];
    state.lastTouched = Date.now();
    return state.history.filter((event) => event.id > afterEventId);
}

export function subscribeToAgentEvents(agentId: number, listener: (event: AgentEventEnvelope) => void) {
    const state = getOrCreateState(agentId);
    state.listeners.add(listener);
    state.lastTouched = Date.now();
    return () => {
        const current = agentStreams.get(agentId);
        if (!current) return;
        current.listeners.delete(listener);
        current.lastTouched = Date.now();
    };
}
