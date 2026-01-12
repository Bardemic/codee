import { workos, COOKIE_NAME } from '../auth/auth';
import type { Request, Response } from 'express';

export type Context = {
    req: Request;
    res: Response;
    user: { id: string; email: string } | null;
};

export async function createContext({ req, res }: { req: Request; res: Response }) {
    const sealedSession = req.cookies[COOKIE_NAME];

    if (!sealedSession) {
        return { req, res, user: null };
    }

    try {
        const session = workos.userManagement.loadSealedSession({
            sessionData: sealedSession,
            cookiePassword: process.env.WORKOS_COOKIE_PASSWORD!,
        });

        const authResult = await session.authenticate();

        if (!authResult.authenticated) {
            // Try to refresh the session if authentication failed
            if (authResult.reason === 'session_expired') {
                try {
                    const { sealedSession: newSealedSession } = await session.refresh();

                    res.cookie(COOKIE_NAME, newSealedSession, {
                        path: '/',
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'lax',
                    });

                    // Re-authenticate with the new session
                    const newSession = workos.userManagement.loadSealedSession({
                        sessionData: newSealedSession,
                        cookiePassword: process.env.WORKOS_COOKIE_PASSWORD!,
                    });
                    const newAuthResult = await newSession.authenticate();

                    if (newAuthResult.authenticated && 'user' in newAuthResult) {
                        const user = newAuthResult.user;
                        return { req, res, user: { id: user.id, email: user.email } };
                    }
                } catch (refreshError) {
                    console.error('TRPC context session refresh failed:', refreshError);
                }
            }

            return { req, res, user: null };
        }

        if (!('user' in authResult)) {
            return { req, res, user: null };
        }

        const user = authResult.user;
        return { req, res, user: { id: user.id, email: user.email } };
    } catch (error) {
        console.error('TRPC context session validation error:', error);
        return { req, res, user: null };
    }
}

export type AppContext = Awaited<ReturnType<typeof createContext>>;
