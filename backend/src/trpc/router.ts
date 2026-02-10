import { router } from './trpc';
import { integrationsRouter } from './routers/integrations';
import { workersRouter } from './routers/workers';
import { workspaceRouter } from './routers/workspace';
import { organizationRouter } from './routers/organization';
import { paymentRouter } from './routers/payment';
import { environmentsRouter } from './routers/environments';

export const appRouter = router({
    environments: environmentsRouter,
    integrations: integrationsRouter,
    workers: workersRouter,
    workspace: workspaceRouter,
    organization: organizationRouter,
    payment: paymentRouter,
});

export type AppRouter = typeof appRouter;
