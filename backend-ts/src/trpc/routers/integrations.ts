import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { authedProcedure, router } from '../trpc';
import { AppDataSource } from '../../db/data-source';
import { IntegrationProvider } from '../../db/entities/IntegrationProvider';
import { IntegrationConnection } from '../../db/entities/IntegrationConnection';
import { Tool } from '../../db/entities/Tool';
import { getInstallationToken } from '../../utils/github';

const connectInput = z.object({
    providerId: z.number().optional(),
    providerSlug: z.string().optional(),
    data: z.record(z.string(), z.unknown()),
});

export const integrationsRouter = router({
    list: authedProcedure.query(async ({ ctx }) => {
        const providerRepository = AppDataSource.getRepository(IntegrationProvider);
        const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
        const toolRepository = AppDataSource.getRepository(Tool);

        const providers = await providerRepository.find();
        const connections = await connectionRepository.find({
            where: { userId: ctx.user.id },
            relations: ['provider'],
        });

        const tools = await toolRepository.find({ relations: ['provider'] });

        const result = providers.map((provider) => {
            const connection = connections.find((c) => c.provider.id === provider.id);
            const providerTools = tools
                .filter((tool) => tool.provider?.id === provider.id)
                .map((tool) => ({
                    id: tool.id,
                    display_name: tool.displayName,
                    slug_name: tool.slugName,
                    is_model: tool.isModel,
                }));
            return {
                id: provider.id,
                slug: provider.slug,
                name: provider.displayName,
                connected: !!connection,
                connection_id: connection?.id,
                tools: providerTools,
                has_cloud_agent: provider.hasCloudAgent,
            };
        });

        const cursorConnection = connections.find((connection) => connection.provider.slug === 'cursor');
        if (cursorConnection) {
            const apiKey = cursorConnection.getDataConfig()?.api_key;
            if (apiKey) {
                try {
                    const response = await fetch('https://api.cursor.com/v0/models', {
                        headers: {
                            Authorization: `Basic ${btoa(`${apiKey}:`)}`,
                        },
                        signal: AbortSignal.timeout(5000),
                    });
                    if (response.ok) {
                        const cursorModelsSchema = z.object({ models: z.array(z.string()) });
                        const parsedResponse = cursorModelsSchema.safeParse(await response.json());
                        const models = parsedResponse.success ? parsedResponse.data.models : [];
                        const cursorProvider = result.find((provider) => provider.slug === 'cursor');
                        if (cursorProvider) {
                            cursorProvider.tools.push(
                                ...models.map((modelName) => ({
                                    id: 0,
                                    display_name: modelName,
                                    slug_name: modelName,
                                    is_model: true,
                                }))
                            );
                        }
                    }
                } catch (error) {
                    console.warn('Failed to fetch Cursor models:', error);
                }
            }
        }

        return result;
    }),

    connect: authedProcedure.input(connectInput).mutation(async ({ ctx, input }) => {
        const providerRepository = AppDataSource.getRepository(IntegrationProvider);
        let provider: IntegrationProvider | null = null;
        if (input.providerId) {
            provider = await providerRepository.findOne({
                where: { id: input.providerId },
            });
        } else if (input.providerSlug) {
            provider = await providerRepository.findOne({
                where: { slug: input.providerSlug },
            });
        }
        if (!provider)
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'provider missing',
            });

        const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
        const existing = await connectionRepository.findOne({
            where: { userId: ctx.user.id, provider: { id: provider.id } },
            relations: ['provider'],
        });
        if (existing) {
            throw new TRPCError({
                code: 'CONFLICT',
                message: 'integration already connected',
            });
        }

        const connection = connectionRepository.create({
            userId: ctx.user.id,
            provider,
            externalId: typeof input.data.external_id === 'string' ? input.data.external_id : '',
        });

        if (provider.slug === 'github_app') {
            const installationId = input.data['installation_id'] as string | undefined;
            if (!installationId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'installation_id required',
                });
            }
            const token = await getInstallationToken(installationId);
            if (!token)
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'invalid installation',
                });
            connection.setDataConfig({ installation_id: installationId });
        } else if (provider.slug === 'posthog' || provider.slug === 'cursor' || provider.slug === 'jules') {
            const apiKey = input.data['api_key'] as string | undefined;
            if (!apiKey)
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'api_key required',
                });
            connection.setDataConfig({ api_key: apiKey });
        } else {
            connection.setDataConfig(Object.fromEntries(Object.entries(input.data).map(([k, v]) => [k, String(v)])));
        }

        await connectionRepository.save(connection);
        return { ok: true };
    }),

    disconnect: authedProcedure.input(z.object({ connectionId: z.number() })).mutation(async ({ ctx, input }) => {
        const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
        const connection = await connectionRepository.findOne({
            where: { id: input.connectionId, userId: ctx.user.id },
        });
        if (!connection) throw new TRPCError({ code: 'NOT_FOUND' });
        await connectionRepository.remove(connection);
        return { ok: true };
    }),

    repositories: authedProcedure.query(async ({ ctx }) => {
        const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
        const connection = await connectionRepository.findOne({
            where: { userId: ctx.user.id, provider: { slug: 'github_app' } },
            relations: ['provider'],
        });
        if (!connection)
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'GitHub not connected',
            });

        const installationId = connection.getDataConfig()?.installation_id;
        if (!installationId)
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'installation missing',
            });

        const token = await getInstallationToken(String(installationId));
        if (!token)
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'token fetch failed',
            });

        const response = await fetch('https://api.github.com/installation/repositories?per_page=100', {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
            },
        });
        if (!response.ok)
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'github error',
            });
        const json = await response.json();
        const repoList = z.object({ repositories: z.array(z.unknown()) }).safeParse(json);
        const repoSchema = z.object({
            id: z.number(),
            full_name: z.string(),
            default_branch: z.string().optional(),
        });
        const parsedRepos = repoList.success ? repoSchema.array().safeParse(repoList.data.repositories) : null;
        const repos = parsedRepos?.success
            ? parsedRepos.data.map((repository) => ({
                  github_id: repository.id,
                  name: repository.full_name,
                  default_branch: repository.default_branch || '',
              }))
            : [];
        return repos;
    }),
});
