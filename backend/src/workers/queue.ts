import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { runAgentJob, runOrchestratorAgentJob } from './agent';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379/0';

const queueConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const workerConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

export type AgentJobPayload = {
    agentId: number;
    prompt: string;
    repositoryFullName?: string; // Optional - will use agent's workspace repo if not provided
    toolSlugs?: string[];
    baseBranch: string;
    isOrchestratorAgent: boolean;
};

export const agentQueue = new Queue<AgentJobPayload>('agent-tasks', {
    connection: queueConnection,
});

export async function enqueueAgentJob(payload: AgentJobPayload) {
    await agentQueue.add('agent', payload, {
        removeOnComplete: true,
        removeOnFail: false,
    });
}

export async function startWorkers() {
    const worker = new Worker(
        'agent-tasks',
        async (job) => {
            if (job.name === 'agent') {
                if (job.data.isOrchestratorAgent) {
                    return runOrchestratorAgentJob(job.data);
                }
                return runAgentJob(job.data);
            }
            throw new Error(`unknown job ${job.name}`);
        },
        {
            connection: workerConnection,
            concurrency: 10,
            lockDuration: 600000,
        }
    );

    worker.on('failed', (job, error) => {
        console.error('[agent worker] failed', job?.name, error);
    });
}
