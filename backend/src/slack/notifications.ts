import axios from 'axios';
import { AppDataSource } from '../db/data-source';
import { Workspace } from '../db/entities/Workspace';
import { IntegrationConnection } from '../db/entities/IntegrationConnection';
import { Agent, AgentStatus } from '../db/entities/Agent';

function getStatusEmoji(status: AgentStatus): string {
    switch (status) {
        case AgentStatus.COMPLETED:
            return '✅';
        case AgentStatus.RUNNING:
            return '🚧';
        case AgentStatus.FAILED:
            return '❌';
        case AgentStatus.PENDING:
        default:
            return '⏳';
    }
}

function getStatusText(status: AgentStatus): string {
    switch (status) {
        case AgentStatus.COMPLETED:
            return 'Completed';
        case AgentStatus.RUNNING:
            return 'In Progress';
        case AgentStatus.FAILED:
            return 'Failed';
        case AgentStatus.PENDING:
        default:
            return 'Pending';
    }
}

function formatWorkspaceMessage(workspace: Workspace, agents: Agent[]): string {
    const lines = [
        `*Workspace "${workspace.name}" created!*`,
        `Repository: ${workspace.githubRepositoryName} (branch: ${workspace.currentBranch})`,
        '',
        '*Agents:*',
    ];

    for (const agent of agents) {
        const emoji = getStatusEmoji(agent.status);
        const statusText = getStatusText(agent.status);
        lines.push(`${emoji} <${agent.url}|${agent.name}> - ${statusText}`);
    }

    return lines.join('\n');
}

export async function sendWorkspaceCreatedMessage(workspaceId: number, channel: string, userId: string): Promise<void> {
    const workspaceRepository = AppDataSource.getRepository(Workspace);
    const workspace = await workspaceRepository.findOne({
        where: { id: workspaceId },
        relations: ['providerAgents'],
    });

    if (!workspace) {
        console.error('Workspace not found for Slack notification');
        return;
    }

    const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
    const connection = await connectionRepository.findOne({
        where: { userId, provider: { slug: 'slack' } },
        relations: ['provider'],
    });

    if (!connection) {
        console.error('No Slack connection found for user');
        return;
    }

    const config = connection.getDataConfig();
    const accessToken = config.access_token;

    if (!accessToken) {
        console.error('No Slack access token found');
        return;
    }

    try {
        const response = await axios.post(
            'https://slack.com/api/chat.postMessage',
            {
                channel,
                text: formatWorkspaceMessage(workspace, workspace.providerAgents),
                mrkdwn: true,
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.data.ok && response.data.ts) {
            workspace.slackChannelId = channel;
            workspace.slackMessageTs = response.data.ts;
            await workspaceRepository.save(workspace);
        }
    } catch (error) {
        console.error('Failed to send Slack workspace created message:', error);
    }
}

export async function updateAgentStatus(agentId: number): Promise<void> {
    const agentRepository = AppDataSource.getRepository(Agent);
    const agent = await agentRepository.findOne({
        where: { id: agentId },
        relations: ['workspace', 'workspace.providerAgents'],
    });

    if (!agent || !agent.workspace.slackChannelId || !agent.workspace.slackMessageTs) {
        return;
    }

    const workspace = agent.workspace;
    const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
    const connection = await connectionRepository.findOne({
        where: { userId: workspace.userId, provider: { slug: 'slack' } },
        relations: ['provider'],
    });

    if (!connection) {
        return;
    }

    const config = connection.getDataConfig();
    const accessToken = config.access_token;

    if (!accessToken) {
        return;
    }

    try {
        await axios.post(
            'https://slack.com/api/chat.update',
            {
                channel: workspace.slackChannelId,
                ts: workspace.slackMessageTs,
                text: formatWorkspaceMessage(workspace, workspace.providerAgents),
                mrkdwn: true,
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );
    } catch (error) {
        console.error('Failed to update Slack agent status:', error);
    }
}
