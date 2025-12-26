import crypto from 'crypto';
import express, { type Express, Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../db/data-source';
import { WorkerDefinition } from '../db/entities/WorkerDefinition';
import { Workspace } from '../db/entities/Workspace';
import { WorkspaceTool } from '../db/entities/WorkspaceTool';
import { Tool } from '../db/entities/Tool';
import { createAgentsFromProviders } from '../providers';
import { generateTitle } from '../utils/llm';
import { Agent, AgentStatus } from '../db/entities/Agent';
import { In } from 'typeorm';
import { WorkerDefinitionTool } from '../db/entities/WorkerDefinitionTool';

const router = Router();

const cloudProviderSchema = z.object({
    name: z.string(),
    agents: z.array(z.object({ model: z.string().nullable().optional() })),
});

function verifySignature(secret: string, payload: Buffer, signatureHeader?: string) {
    if (!signatureHeader) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

async function createWorkspaceFromWebhook(params: { worker: WorkerDefinition; repository: string; message: string; data: Record<string, unknown> }) {
    const workspaceRepository = AppDataSource.getRepository(Workspace);
    const toolRepository = AppDataSource.getRepository(Tool);
    const workspaceToolRepository = AppDataSource.getRepository(WorkspaceTool);
    const linkRepository = AppDataSource.getRepository(WorkerDefinitionTool);

    const title = await generateTitle(params.message);
    const workspace = workspaceRepository.create({
        githubRepositoryName: params.repository,
        userId: params.worker.userId,
        name: title,
        workerId: params.worker.id,
    });
    await workspaceRepository.save(workspace);

    const links = await linkRepository.find({
        where: { workerDefinition: { id: params.worker.id } },
        relations: ['tool'],
    });
    const toolIds = links.map((link) => link.tool?.id).filter((id): id is number => typeof id === 'number');
    const tools = toolIds.length ? await toolRepository.findBy({ id: In(toolIds) }) : [];
    for (const tool of tools) {
        await workspaceToolRepository.save(workspaceToolRepository.create({ workspace, tool }));
    }

    const rawProviders = params.worker.cloudProviders;
    const parsedProviders = cloudProviderSchema.array().safeParse(rawProviders);
    const cloudProviders = parsedProviders.success ? parsedProviders.data : [];

    const toolSlugs = tools.map((tool) => tool.slugName);
    await createAgentsFromProviders({
        userId: params.worker.userId,
        workspace,
        repositoryFullName: params.repository,
        message: params.message,
        toolSlugs,
        cloudProviders,
    });
    return workspace;
}

router.post('/github/events', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET || '';
    if (!verifySignature(secret, req.body, req.header('x-hub-signature-256'))) {
        return res.status(401).send('signature mismatch');
    }
    const event = req.header('x-github-event');
    if (!event) return res.status(400).send('no event');
    const body = JSON.parse(req.body.toString('utf8'));
    if (event === 'issue_comment' && body.action === 'created') {
        const comment: string | undefined = body.comment?.body;
        if (!comment || !comment.includes('--codee')) return res.status(204).end();
        const match = comment.match(/--codee\/(\S+)/);
        if (!match) return res.status(400).send('missing worker slug');
        const slug = match[1];
        const issue = body.issue;
        const repository = body.repository?.full_name;
        if (!issue || !repository) return res.status(400).send('missing repo/issue');

        const workerRepository = AppDataSource.getRepository(WorkerDefinition);
        const worker = await workerRepository.findOne({
            where: { slug },
        });
        if (!worker) return res.status(404).send('worker not found');
        const message = worker.prompt + '\n\nGitHub Issue Title: ' + issue.title + '\n\nDescription: ' + issue.body;
        await createWorkspaceFromWebhook({
            worker,
            repository,
            message,
            data: { comment, issue },
        });
    }
    return res.status(204).end();
});

router.post('/posthog/issue', express.json(), async (req, res) => {
    const body = req.body || {};
    const workerSlug = body.worker_slug;
    const key = body.key;
    const repository = body.repository;
    const event = body.event;
    if (!workerSlug || !key || !repository || !event) {
        return res.status(400).send('missing fields');
    }
    const workerRepository = AppDataSource.getRepository(WorkerDefinition);
    const workers = await workerRepository.find({
        where: { slug: workerSlug },
    });
    const worker = workers.find((w) => w.key === key);
    if (!worker) return res.status(403).send('invalid key');
    const message = worker.prompt + '\n\n' + 'PostHog event data: ' + JSON.stringify(event, null, 2);
    await createWorkspaceFromWebhook({
        worker,
        repository,
        message,
        data: event,
    });
    return res.status(204).end();
});

router.post('/cursor/complete/:agentId', express.json(), async (req, res) => {
    const agentId = Number(req.params.agentId);
    const status = req.body?.status;
    const agentRepository = AppDataSource.getRepository(Agent);
    const agent = await agentRepository.findOne({ where: { id: agentId } });
    if (!agent) return res.status(404).send('agent not found');
    if (status === 'FINISHED') {
        agent.status = AgentStatus.COMPLETED;
        await agentRepository.save(agent);
    }
    return res.status(204).end();
});

export function registerWebhooks(app: Express) {
    app.use('/webhooks', router);
}
