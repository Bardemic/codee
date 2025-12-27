import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379/0';

let redisClient: Redis | null = null;

export function getRedis(): Redis {
    if (!redisClient) {
        redisClient = new Redis(REDIS_URL, {
            maxRetriesPerRequest: null,
        });
    }
    return redisClient;
}

export async function closeRedis() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
}
