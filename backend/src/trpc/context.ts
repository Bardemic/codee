import { workos, COOKIE_NAME } from '../auth/auth';
import type { Request, Response } from 'express';
import { getUserOrganization } from '../services/organizationService';

export type Context = {
    req: Request;
    res: Response;
    user: { id: string; email: string } | null;
    organization: { id: number; name: string; workosOrganizationId: string } | null;
};

export async function createContext({ req, res }: { req: Request; res: Response }) {
    // Development bypass
    if (process.env.DEV_BYPASS_AUTH === 'true') {
        return {
            req,
            res,
            user: { id: 'user_fake', email: 'test@example.com' },
            organization: { id: 1, name: 'Fake Organization', workosOrganizationId: 'org_fake' }
        };
    }

    const sealedSession = req.cookies[COOKIE_NAME];

    if (!sealedSession) {
        return { req, res, user: null, organization: null };
    }

    try {
        const session = workos.userManagement.loadSealedSession({
            sessionData: sealedSession,
            cookiePassword: process.env.WORKOS_COOKIE_PASSWORD!,
        });

        const authResult = await session.authenticate();

        if (!authResult.authenticated) {
            try {
                const sessionResponse = await session.refresh();

                if (sessionResponse.authenticated && sessionResponse.sealedSession) {
                    res.cookie(COOKIE_NAME, sessionResponse.sealedSession, {
                        path: '/',
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'lax',
                        maxAge: 30 * 24 * 60 * 60 * 1000,
                    });

                    const newSession = workos.userManagement.loadSealedSession({
                        sessionData: sessionResponse.sealedSession,
                        cookiePassword: process.env.WORKOS_COOKIE_PASSWORD!,
                    });
                    const newAuthResult = await newSession.authenticate();

                    if (newAuthResult.authenticated && 'user' in newAuthResult) {
                        const user = newAuthResult.user;
                        const organization = await getUserOrganization(user.id);
                        return { req, res, user: { id: user.id, email: user.email }, organization };
                    }
                }
            } catch (refreshError) {
                console.error('TRPC context session refresh failed:', refreshError);
            }

            return { req, res, user: null, organization: null };
        }

        if ('user' in authResult) {
            const user = authResult.user;
            const organization = await getUserOrganization(user.id);
            return { req, res, user: { id: user.id, email: user.email }, organization };
        }

        return { req, res, user: null, organization: null };
    } catch (error) {
        console.error('TRPC context session validation error:', error);
        return { req, res, user: null, organization: null };
    }
}

export type AppContext = Awaited<ReturnType<typeof createContext>>;
