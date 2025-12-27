import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../backend/src/trpc/router';

type RouterOutput = inferRouterOutputs<AppRouter>;

export type Repository = RouterOutput['integrations']['repositories'][number];
export type Tool = RouterOutput['integrations']['list'][number]['tools'][number];
export type Integration = RouterOutput['integrations']['list'][number];
export type Agent = RouterOutput['workspace']['list'][number]['agents'][number];
export type Workspace = RouterOutput['workspace']['list'][number];
export type ToolCall = Omit<RouterOutput['workspace']['messages'][number]['tool_calls'][number], 'id'> & {
    id: number | string;
};
export type Message = Omit<RouterOutput['workspace']['messages'][number], 'id' | 'tool_calls'> & {
    id: number | string;
    tool_calls: ToolCall[];
    isPendingAgent?: boolean;
};
export type Worker = RouterOutput['workers']['list'][number];
export type LinkedWorkspace = RouterOutput['workers']['list'][number]['workspaces'][number];

export type AgentConfig = {
    model: string;
};

export type ProviderConfig = {
    name: string;
    agents: AgentConfig[];
};
