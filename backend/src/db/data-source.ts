import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Organization } from './entities/Organization';
import { OrganizationMember } from './entities/OrganizationMember';
import { IntegrationProvider } from './entities/IntegrationProvider';
import { IntegrationConnection } from './entities/IntegrationConnection';
import { Tool } from './entities/Tool';
import { WorkerDefinition } from './entities/WorkerDefinition';
import { Workspace } from './entities/Workspace';
import { Agent } from './entities/Agent';
import { Message } from './entities/Message';
import { ToolCall } from './entities/ToolCall';
import { WorkspaceTool } from './entities/WorkspaceTool';
import { WorkerDefinitionTool } from './entities/WorkerDefinitionTool';
import { seedDefaults } from './seed';
import { SlackUserMapping } from './entities/SlackUserMapping';

export const AppDataSource = new DataSource({
    type: 'sqlite',
    database: 'database.sqlite',
    synchronize: true,
    entities: [
        Agent,
        IntegrationConnection,
        IntegrationProvider,
        Message,
        Organization,
        OrganizationMember,
        SlackUserMapping,
        Tool,
        ToolCall,
        WorkerDefinition,
        WorkerDefinitionTool,
        Workspace,
        WorkspaceTool,
    ],
});

export async function initDataSource() {
    if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
        await seedDefaults(AppDataSource);
    }
    return AppDataSource;
}
