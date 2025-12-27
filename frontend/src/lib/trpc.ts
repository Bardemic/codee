import { createTRPCReact, httpBatchLink, httpLink, splitLink } from '@trpc/react-query';
import { QueryClient } from '@tanstack/react-query';
import superjson from 'superjson';
import type { AppRouter } from '../../../backend/src/trpc/router';

export const trpc = createTRPCReact<AppRouter>();

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60,
            retry: 1,
        },
    },
});

export const trpcClient = trpc.createClient({
    links: [
        splitLink({
            condition: (op) => {
                return op.context.skipBatch === true;
            },
            true: httpLink({
                url: 'http://localhost:5001/api/trpc',
                transformer: superjson,
                fetch(url, options) {
                    return fetch(url, {
                        ...options,
                        credentials: 'include',
                    });
                },
            }),
            false: httpBatchLink({
                url: 'http://localhost:5001/api/trpc',
                transformer: superjson,
                fetch(url, options) {
                    return fetch(url, {
                        ...options,
                        credentials: 'include',
                    });
                },
            }),
        }),
    ],
});
