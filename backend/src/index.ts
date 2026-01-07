import 'reflect-metadata';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { toNodeHandler } from 'better-auth/node';

import { auth } from './auth/auth';
import { initDataSource } from './db/data-source';
import { createContext } from './trpc/context';
import { appRouter } from './trpc/router';
import { registerWebhooks } from './express/webhooks';
import { sseRouter } from './stream/sse';
import { startWorkers } from './workers/queue';
import { closeRedis } from './utils/redis';
import { flushPostHog } from './utils/posthog';
import { validateEnvironment } from './utils/env';
import { slackOAuthRouter } from './slack/oauth';
import { slackEventsRouter } from './slack/events';

const PORT = Number(process.env.PORT || 5001);

async function shutdown() {
    await closeRedis();
    await flushPostHog();
    process.exit(0);
}

async function bootstrap() {
    validateEnvironment();
    await initDataSource();

    const app = express();

    app.use(
        cors({
            origin: 'http://localhost:5173',
            credentials: true,
        })
    );
    app.use((req, res, next) => {
        if (req.path.startsWith('/webhooks/github/events') || req.path.startsWith('/api/auth')) {
            return next();
        }
        if (req.path.startsWith('/webhooks/slack/events')) {
            return express.raw({ type: 'application/json' })(req, res, (err) => {
                if (err) return next(err);
                (req as any).rawBody = req.body.toString('utf8');
                next();
            });
        }
        return express.json({ limit: '5mb' })(req, res, next);
    });
    app.use(morgan('dev'));

    app.get('/health', (_req, res) => {
        res.json({ ok: true, service: 'backend' });
    });

    app.all('/api/auth/{*splat}', toNodeHandler(auth));

    app.use(
        '/api/trpc',
        createExpressMiddleware({
            router: appRouter,
            createContext,
        })
    );

    registerWebhooks(app);
    app.use('/stream', sseRouter);
    app.use('/api/slack', slackOAuthRouter);
    app.use('/webhooks/slack', slackEventsRouter);

    app.listen(PORT, () => {
        console.log(`[backend] listening on http://localhost:${PORT}`);
    });

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('uncaughtException', (err) => {
        console.error('[backend] uncaught exception:', err);
        shutdown();
    });

    await startWorkers();
}

bootstrap().catch((err) => {
    console.error('Failed to start backend', err);
    process.exit(1);
});
