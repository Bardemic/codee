import { Router } from 'express';
import { workos, COOKIE_NAME, config } from '../auth/auth';
import { ensureUserHasOrganization } from '../services/organizationService';
import { AuthenticateWithSessionCookieFailureReason } from '@workos-inc/node';

const router = Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

router.get('/login', (req, res) => {
    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
        provider: 'authkit',
        redirectUri: config.redirectUri,
        clientId: config.clientId,
    });

    res.redirect(authorizationUrl);
});

router.get('/callback', async (req, res) => {
    const code = req.query.code as string;

    if (!code) {
        return res.status(400).send('No code provided');
    }

    try {
        const { user, sealedSession } = await workos.userManagement.authenticateWithCode({
            code,
            clientId: config.clientId,
            session: {
                sealSession: true,
                cookiePassword: config.cookiePassword,
            },
        });

        // Auto-create organization if this is first login
        await ensureUserHasOrganization(user);

        res.cookie(COOKIE_NAME, sealedSession, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        });

        res.redirect(`${FRONTEND_URL}/`);
    } catch (error) {
        console.error('Auth callback error:', error);
        res.redirect(`${FRONTEND_URL}/login`);
    }
});

router.get('/logout', async (req, res) => {
    const sealedSession = req.cookies[COOKIE_NAME];

    if (!sealedSession) {
        return res.redirect(`${FRONTEND_URL}/login`);
    }

    try {
        const session = workos.userManagement.loadSealedSession({
            sessionData: sealedSession,
            cookiePassword: config.cookiePassword,
        });

        const logoutUrl = await session.getLogoutUrl();

        res.clearCookie(COOKIE_NAME, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        });

        res.redirect(logoutUrl);
    } catch (error) {
        console.error('Logout error:', error);
        res.clearCookie(COOKIE_NAME);
        res.redirect(`${FRONTEND_URL}/login`);
    }
});

router.get('/session', async (req, res) => {
    const sealedSession = req.cookies[COOKIE_NAME];

    if (!sealedSession) {
        return res.json({ authenticated: false, user: null });
    }

    try {
        const session = workos.userManagement.loadSealedSession({
            sessionData: sealedSession,
            cookiePassword: config.cookiePassword,
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
                    });

                    const newSession = workos.userManagement.loadSealedSession({
                        sessionData: sessionResponse.sealedSession,
                        cookiePassword: config.cookiePassword,
                    });
                    const newAuthResult = await newSession.authenticate();

                    if (newAuthResult.authenticated && 'user' in newAuthResult) {
                        return res.json({ authenticated: true, user: newAuthResult.user });
                    }
                }
            } catch (refreshError) {
                console.error('Session refresh failed:', refreshError);
            }

            res.clearCookie(COOKIE_NAME);
            return res.json({ authenticated: false, user: null });
        }

        if (!('user' in authResult)) {
            res.clearCookie(COOKIE_NAME);
            return res.json({ authenticated: false, user: null });
        }

        return res.json({ authenticated: true, user: authResult.user });
    } catch (error) {
        console.error('Session validation error:', error);
        res.clearCookie(COOKIE_NAME);
        return res.json({ authenticated: false, user: null });
    }
});

export const authRouter = router;
