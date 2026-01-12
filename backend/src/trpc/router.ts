import { router } from './trpc';
import { integrationsRouter } from './routers/integrations';
import { workersRouter } from './routers/workers';
import { workspaceRouter } from './routers/workspace';
import { organizationRouter } from './routers/organization';
import { billingRouter } from './routers/billing';

export const appRouter = router({
    integrations: integrationsRouter,
    workers: workersRouter,
    workspace: workspaceRouter,
    organization: organizationRouter,
    billing: billingRouter,
});

export type AppRouter = typeof appRouter;
