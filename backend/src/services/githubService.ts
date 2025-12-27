import { TRPCError } from '@trpc/server';
import { AppDataSource } from '../db/data-source';
import { IntegrationConnection } from '../db/entities/IntegrationConnection';
import { getInstallationToken } from '../utils/github';

/**
 * Get GitHub access token for a user by their user ID.
 * This centralizes GitHub token fetching logic used across the codebase.
 */
export async function getGithubTokenForUser(userId: string): Promise<string> {
    const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
    const connection = await connectionRepository.findOne({
        where: { userId, provider: { slug: 'github_app' } },
        relations: ['provider'],
    });

    if (!connection) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'GitHub integration not connected. Please connect your GitHub account.',
        });
    }

    const config = connection.getDataConfig();
    const installationId = config?.installation_id;

    if (!installationId) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'GitHub installation ID missing. Please reauthorize the integration.',
        });
    }

    const token = await getInstallationToken(installationId);

    if (!token) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Failed to obtain GitHub access token. Please verify your installation.',
        });
    }

    return token;
}
