import { Agent } from '../db/entities/Agent';
import { Workspace } from '../db/entities/Workspace';
import type { SenderType, MessageImage } from '../db/entities/Message';
import type { ToolCallImage } from '../db/entities/ToolCall';

export type ProviderToolCall = {
    id: number;
    created_at: Date;
    tool_name: string;
    arguments: Record<string, unknown>;
    result: string;
    status: string;
    images: ToolCallImage[];
};

export type ProviderMessage = {
    id: number;
    created_at: Date;
    content: string;
    sender: SenderType;
    tool_calls: ProviderToolCall[];
    images: MessageImage[];
};

export interface CloudProvider {
    slug: string;
    createAgent(params: {
        organizationId: number;
        workspace: Workspace;
        repositoryFullName: string;
        message: string;
        toolSlugs: string[];
        baseBranch: string;
        model?: string | null;
        isOrchestratorAgent: boolean;
        images: MessageImage[];
    }): Promise<Agent>;
    getMessages(agent: Agent): Promise<ProviderMessage[]>;
    sendMessage(agent: Agent, message: string, images: MessageImage[]): Promise<boolean>;
}
