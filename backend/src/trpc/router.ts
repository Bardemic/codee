import { router } from './trpc';
import { integrationsRouter } from './routers/integrations';
import { workersRouter } from './routers/workers';
import { workspaceRouter } from './routers/workspace';
import { organizationRouter } from './routers/organization';

export const appRouter = router({
    integrations: integrationsRouter,
    workers: workersRouter,
    workspace: workspaceRouter,
    organization: organizationRouter,
});

export type AppRouter = typeof appRouter;
