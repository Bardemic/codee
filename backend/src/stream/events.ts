import { getRedis } from '../utils/redis';

const STREAM_MAX_LEN = 5000;

export async function emitStatus(agentId: number, phase: string, step?: string, detail?: string, extra?: Record<string, unknown>) {
    const redisClient = getRedis();
    await redisClient.xadd(
        `stream:agent:${agentId}`,
        'MAXLEN',
        '~',
        STREAM_MAX_LEN,
        '*',
        'event',
        'status',
        'phase',
        phase,
        'step',
        step || '',
        'detail',
        detail || '',
        ...(extra ? Object.entries(extra).flatMap(([key, value]) => [key, String(value)]) : [])
    );
}

export async function emitError(agentId: number, code: string, message: string, step?: string) {
    const redisClient = getRedis();
    await redisClient.xadd(
        `stream:agent:${agentId}`,
        'MAXLEN',
        '~',
        STREAM_MAX_LEN,
        '*',
        'event',
        'error',
        'code',
        code,
        'message',
        message,
        'step',
        step || ''
    );
}

export async function emitDone(agentId: number, reason: string) {
    const redisClient = getRedis();
    await redisClient.xadd(`stream:agent:${agentId}`, 'MAXLEN', '~', STREAM_MAX_LEN, '*', 'event', 'done', 'reason', reason);
}
