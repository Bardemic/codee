import 'reflect-metadata';
import { DataSource } from 'typeorm';
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

const {
    PGHOST = 'localhost',
    PGPORT = '5432',
    PGUSER = 'postgres',
    PGPASSWORD = '',
    PGDATABASE = 'codee',
    PGSSL = 'false',
    NODE_ENV = 'development',
} = process.env;

const derivedUrl = `postgres://${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}@${PGHOST}:${PGPORT}/${PGDATABASE}`;

export const AppDataSource = new DataSource({
    type: 'postgres',
    url: derivedUrl,
    ssl:
        PGSSL === 'true'
            ? {
                  rejectUnauthorized: false,
              }
            : undefined,
    synchronize: NODE_ENV !== 'production',
    entities: [IntegrationProvider, IntegrationConnection, Tool, WorkerDefinition, Workspace, Agent, Message, ToolCall, WorkspaceTool, WorkerDefinitionTool],
});

export async function initDataSource() {
    if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
        await seedDefaults(AppDataSource);
    }
    return AppDataSource;
}
