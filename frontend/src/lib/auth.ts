import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
    baseURL: 'http://localhost:5001',
    fetchOptions: {
        credentials: 'include',
    },
});

export const { signIn, signUp, signOut, useSession } = authClient;
