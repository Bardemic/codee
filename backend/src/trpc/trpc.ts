import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { AppContext } from './context';

const t = initTRPC.context<AppContext>().create({
    transformer: superjson,
    errorFormatter({ shape }) {
        return shape;
    },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
});
