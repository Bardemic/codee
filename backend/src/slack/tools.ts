import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { AppDataSource } from '../db/data-source';
import { Workspace } from '../db/entities/Workspace';
import { IntegrationProvider } from '../db/entities/IntegrationProvider';
import { IntegrationConnection } from '../db/entities/IntegrationConnection';
import { getGithubTokenForUser } from '../services/githubService';
import axios from 'axios';
import { Like } from 'typeorm';

export function createSlackTools(userId: string) {
    const listWorkspacesInputSchema = z.object({
        limit: z.number().default(10).describe('Number of workspaces to return'),
    });

    const getWorkspaceAgentsInputSchema = z.object({
        workspace_id: z.number().describe('The workspace ID to get agents for'),
    });

    const searchWorkspacesInputSchema = z.object({
        query: z.string().describe('Search query for workspace names'),
    });

    return {
        listWorkspaces: tool({
            description: 'List recent workspaces for the user with their agent counts',
            inputSchema: zodSchema(listWorkspacesInputSchema),
            execute: async (input) => {
                const { limit } = input;
                const workspaceRepository = AppDataSource.getRepository(Workspace);
                const workspaces = await workspaceRepository.find({
                    where: { userId },
                    relations: ['providerAgents'],
                    order: { createdAt: 'DESC' },
                    take: limit,
                });

                return {
                    workspaces: workspaces.map((workspace) => ({
                        id: workspace.id,
                        name: workspace.name,
                        repository: workspace.githubRepositoryName,
                        branch: workspace.currentBranch,
                        created_at: workspace.createdAt.toISOString(),
                        agent_count: workspace.providerAgents.length,
                    })),
                };
            },
        }),

        getWorkspaceAgents: tool({
            description: 'Get all agents for a specific workspace ID',
            inputSchema: zodSchema(getWorkspaceAgentsInputSchema),
            execute: async (input) => {
                const { workspace_id } = input;
                const workspaceRepository = AppDataSource.getRepository(Workspace);
                const workspace = await workspaceRepository.findOne({
                    where: { id: workspace_id, userId },
                    relations: ['providerAgents'],
                });

                if (!workspace) {
                    return { error: 'Workspace not found' };
                }

                return {
                    workspace_name: workspace.name,
                    agents: workspace.providerAgents.map((agent) => ({
                        id: agent.id,
                        name: agent.name,
                        provider: agent.providerType,
                        status: agent.status,
                        url: agent.url,
                        branch: agent.githubBranchName,
                    })),
                };
            },
        }),

        searchWorkspaces: tool({
            description: 'Search workspaces by name',
            inputSchema: zodSchema(searchWorkspacesInputSchema),
            execute: async (input) => {
                const { query } = input;
                const workspaceRepository = AppDataSource.getRepository(Workspace);
                const workspaces = await workspaceRepository.find({
                    where: { userId, name: Like(`%${query}%`) },
                    relations: ['providerAgents'],
                    order: { createdAt: 'DESC' },
                    take: 20,
                });

                return {
                    results: workspaces.map((workspace) => ({
                        id: workspace.id,
                        name: workspace.name,
                        repository: workspace.githubRepositoryName,
                        branch: workspace.currentBranch,
                        agent_count: workspace.providerAgents.length,
                    })),
                };
            },
        }),

        listRepositories: tool({
            description: 'List available GitHub repositories for the user',
            inputSchema: zodSchema(z.object({})),
            execute: async () => {
                try {
                    const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
                    const connection = await connectionRepository.findOne({
                        where: { userId, provider: { slug: 'github_app' } },
                        relations: ['provider'],
                    });

                    if (!connection) {
                        return { error: 'GitHub not connected' };
                    }

                    const installationId = connection.getDataConfig()?.installation_id;
                    if (!installationId) {
                        return { error: 'GitHub installation not found' };
                    }

                    const token = await getGithubTokenForUser(userId);

                    const response = await axios.get('https://api.github.com/installation/repositories?per_page=100', {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: 'application/vnd.github+json',
                        },
                    });

                    const repositories = response.data.repositories || [];
                    return {
                        repositories: repositories.map((repo: { full_name: string; default_branch: string }) => ({
                            name: repo.full_name,
                            default_branch: repo.default_branch,
                        })),
                    };
                } catch (_error) {
                    return { error: 'Failed to fetch repositories' };
                }
            },
        }),

        listIntegrations: tool({
            description: 'List available integration providers and their connection status',
            inputSchema: zodSchema(z.object({})),
            execute: async () => {
                const providerRepository = AppDataSource.getRepository(IntegrationProvider);
                const connectionRepository = AppDataSource.getRepository(IntegrationConnection);

                const providers = await providerRepository.find({
                    relations: ['tools'],
                });

                const userConnections = await connectionRepository.find({
                    where: { userId },
                    relations: ['provider'],
                });

                const connectionMap = new Map(userConnections.map((connection) => [connection.provider.id, true]));

                return {
                    integrations: providers.map((provider) => ({
                        id: provider.id,
                        name: provider.displayName,
                        slug: provider.slug,
                        connected: connectionMap.has(provider.id),
                        has_cloud_agent: provider.hasCloudAgent,
                        tool_count: provider.tools.length,
                    })),
                };
            },
        }),

        help: tool({
            description: 'Get help information about what the bot can do',
            inputSchema: zodSchema(z.object({})),
            execute: async () => {
                return {
                    capabilities: [
                        'List recent workspaces - Shows your workspaces with agent counts',
                        'Get workspace agents - View all agents for a specific workspace',
                        'Search workspaces - Find workspaces by name',
                        'List repositories - View available GitHub repositories',
                        'List integrations - See available integrations and connection status',
                    ],
                    usage: 'Just mention me with what you need, like "@codee list my workspaces" or "@codee show agents for workspace 123"',
                };
            },
        }),
    };
}
