import { createWorkflow, serve } from '@vercel/workflow';
import type { Request, Response } from 'express';
import { runAgentJob, runOrchestratorAgentJob } from './agent';

export type AgentJobPayload = {
    agentId: number;
    prompt: string;
    repositoryFullName?: string;
    toolSlugs?: string[];
    baseBranch: string;
    isOrchestratorAgent: boolean;
};

const agentWorkflow = createWorkflow<AgentJobPayload>({
    id: 'agent-job',
    run: async (payload) => {
        if (payload.isOrchestratorAgent) {
            await runOrchestratorAgentJob(payload);
            return;
        }
        await runAgentJob(payload);
    },
});

const agentWorkflowServe = serve(agentWorkflow);

export async function enqueueAgentJob(payload: AgentJobPayload) {
    await agentWorkflow.trigger(payload);
}

export function agentWorkflowHandler(req: Request, res: Response) {
    return agentWorkflowServe(req, res);
}
