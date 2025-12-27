import { Agent } from '../db/entities/Agent';
import { Workspace } from '../db/entities/Workspace';
import type { SenderType } from '../db/entities/Message';

export type ProviderMessage = {
    id: number;
    created_at: Date;
    content: string;
    sender: SenderType;
    tool_calls: unknown[];
};

export interface CloudProvider {
    slug: string;
    createAgent(params: {
        userId: string;
        workspace: Workspace;
        repositoryFullName: string;
        message: string;
        toolSlugs: string[];
        model?: string | null;
    }): Promise<Agent>;
    getMessages(agent: Agent): Promise<ProviderMessage[]>;
    sendMessage(agent: Agent, message: string): Promise<boolean>;
}
