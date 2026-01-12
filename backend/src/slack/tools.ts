import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { AppDataSource } from '../db/data-source';
import { Workspace } from '../db/entities/Workspace';
import { IntegrationProvider } from '../db/entities/IntegrationProvider';
import { IntegrationConnection } from '../db/entities/IntegrationConnection';
import { Tool } from '../db/entities/Tool';
import { WorkspaceTool } from '../db/entities/WorkspaceTool';
import { getGithubTokenForUser } from '../services/githubService';
import { createAgentsFromProviders } from '../providers';
import { generateTitle } from '../utils/llm';
import axios from 'axios';
import { Like, In } from 'typeorm';

export function createSlackTools(organizationId: number, slackChannel: string) {
    const listWorkspacesInputSchema = z.object({
        limit: z.number().default(10).describe('Number of workspaces to return'),
    });

    const getWorkspaceAgentsInputSchema = z.object({
        workspace_id: z.number().describe('The workspace ID to get agents for'),
    });

    const searchWorkspacesInputSchema = z.object({
        query: z.string().describe('Search query for workspace names'),
    });

    const listBranchesInputSchema = z.object({
        repository: z.string().describe('Repository full name (e.g., user/repo)'),
    });

    const createWorkspaceInputSchema = z.object({
        prompt: z.string().describe('User prompt for the workspace'),
        repository: z.string().describe('Repository full name (e.g., user/repo)'),
        branch: z.string().optional().describe('Branch name (optional, defaults to repository default branch)'),
        tool_slugs: z.array(z.string()).default([]).describe('Array of tool slugs to use'),
        provider_config: z
            .array(
                z.object({
                    name: z.string().describe('Provider name (Codee, Cursor, or Jules)'),
                    agents: z
                        .array(
                            z.object({
                                model: z.string().nullable().optional().describe('Model name for the agent'),
                            })
                        )
                        .describe('Array of agent configs'),
                })
            )
            .default([{ name: 'Codee', agents: [{}] }])
            .describe('Provider configuration (defaults to 1 Codee agent)'),
    });

    return {
        listWorkspaces: tool({
            description: 'List recent workspaces for the user with their agent counts',
            inputSchema: zodSchema(listWorkspacesInputSchema),
            execute: async (input) => {
                const { limit } = input;
                const workspaceRepository = AppDataSource.getRepository(Workspace);
                const workspaces = await workspaceRepository.find({
                    where: { organizationId },
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
                    where: { id: workspace_id, organizationId },
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
                    where: { organizationId, name: Like(`%${query}%`) },
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
                        where: { organizationId, provider: { slug: 'github_app' } },
                        relations: ['provider'],
                    });

                    if (!connection) {
                        return { error: 'GitHub not connected' };
                    }

                    const installationId = connection.getDataConfig()?.installation_id;
                    if (!installationId) {
                        return { error: 'GitHub installation not found' };
                    }

                    const token = await getGithubTokenForUser(organizationId);

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
                    where: { organizationId },
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

        listBranches: tool({
            description: 'List available branches for a specific repository',
            inputSchema: zodSchema(listBranchesInputSchema),
            execute: async (input) => {
                const { repository } = input;
                try {
                    const token = await getGithubTokenForUser(organizationId);

                    const response = await axios.get(`https://api.github.com/repos/${repository}/branches?per_page=100`, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: 'application/vnd.github+json',
                        },
                    });

                    const branches = response.data || [];
                    return {
                        branches: branches.map((branch: { name: string; commit: { sha: string } }) => ({
                            name: branch.name,
                            commit_sha: branch.commit.sha,
                        })),
                    };
                } catch (_error) {
                    return { error: 'Failed to fetch branches' };
                }
            },
        }),

        listAvailableTools: tool({
            description: 'List available tools from user connected integrations',
            inputSchema: zodSchema(z.object({})),
            execute: async () => {
                const connectionRepository = AppDataSource.getRepository(IntegrationConnection);

                const userConnections = await connectionRepository.find({
                    where: { organizationId },
                    relations: ['provider', 'provider.tools'],
                });

                const allTools: Array<{ slug: string; name: string; provider: string }> = [];

                for (const connection of userConnections) {
                    if (connection.provider.tools) {
                        for (const tool of connection.provider.tools) {
                            allTools.push({
                                slug: tool.slugName,
                                name: tool.displayName,
                                provider: connection.provider.displayName,
                            });
                        }
                    }
                }

                return { tools: allTools };
            },
        }),

        createWorkspace: tool({
            description: 'Create a new workspace with agents for coding tasks',
            inputSchema: zodSchema(createWorkspaceInputSchema),
            execute: async (input) => {
                const { prompt, repository, branch, tool_slugs, provider_config } = input;

                try {
                    const title = await generateTitle(prompt);
                    const workspaceRepository = AppDataSource.getRepository(Workspace);
                    const toolRepository = AppDataSource.getRepository(Tool);

                    let branchName = branch;
                    if (!branchName) {
                        const token = await getGithubTokenForUser(organizationId);
                        const repoResponse = await axios.get(`https://api.github.com/repos/${repository}`, {
                            headers: {
                                Authorization: `Bearer ${token}`,
                                Accept: 'application/vnd.github+json',
                            },
                        });
                        branchName = repoResponse.data.default_branch || 'main';
                    }

                    const newWorkspace = workspaceRepository.create({
                        name: title,
                        organizationId,
                        githubRepositoryName: repository,
                        currentBranch: branchName,
                        slackChannelId: slackChannel,
                    });
                    await workspaceRepository.save(newWorkspace);

                    if (tool_slugs.length > 0) {
                        const tools = await toolRepository.findBy({
                            slugName: In(tool_slugs),
                        });

                        const workspaceToolRepository = AppDataSource.getRepository(WorkspaceTool);
                        const workspaceTools = tools.map((tool) =>
                            workspaceToolRepository.create({
                                workspace: newWorkspace,
                                tool,
                            })
                        );
                        if (workspaceTools.length > 0) {
                            await workspaceToolRepository.save(workspaceTools);
                        }
                    }

                    await createAgentsFromProviders({
                        organizationId,
                        workspace: newWorkspace,
                        repositoryFullName: repository,
                        message: prompt,
                        toolSlugs: tool_slugs,
                        branchName: branchName!,
                        cloudProviders: provider_config,
                        images: [],
                    });

                    const updatedWorkspace = await workspaceRepository.findOne({
                        where: { id: newWorkspace.id },
                        relations: ['providerAgents'],
                    });

                    const agents = updatedWorkspace?.providerAgents || [];
                    const agentLines = agents.map((agent) => {
                        let statusEmoji = '⏳';
                        let statusText = 'Pending';
                        if (agent.status === 'COMPLETED') {
                            statusEmoji = '✅';
                            statusText = 'Completed';
                        } else if (agent.status === 'RUNNING') {
                            statusEmoji = '🚧';
                            statusText = 'In Progress';
                        } else if (agent.status === 'FAILED') {
                            statusEmoji = '❌';
                            statusText = 'Failed';
                        }
                        return `${statusEmoji} <${agent.url}|${agent.name}> - ${statusText}`;
                    });

                    return {
                        workspace_id: newWorkspace.id,
                        workspace_name: newWorkspace.name,
                        repository: repository,
                        branch: branchName,
                        formatted_message: `*Workspace "${newWorkspace.name}" created!*\nRepository: ${repository} (branch: ${branchName})\n\n*Agents:*\n${agentLines.join('\n')}`,
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    return { error: `Failed to create workspace: ${errorMessage}` };
                }
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
                        'List branches - View branches for a specific repository',
                        'List available tools - View tools from your connected integrations',
                        'Create workspace - Create a new workspace with agents for coding tasks',
                        'List integrations - See available integrations and connection status',
                    ],
                    usage: 'Just mention me with what you need, like "@codee list my workspaces" or "@codee create workspace to fix login bug in user/repo"',
                };
            },
        }),
    };
}
