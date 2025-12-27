import { router } from './trpc';
import { integrationsRouter } from './routers/integrations';
import { workersRouter } from './routers/workers';
import { workspaceRouter } from './routers/workspace';

export const appRouter = router({
    integrations: integrationsRouter,
    workers: workersRouter,
    workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
