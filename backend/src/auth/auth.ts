import { WorkOS } from '@workos-inc/node';

const { WORKOS_API_KEY, WORKOS_CLIENT_ID, WORKOS_COOKIE_PASSWORD, WORKOS_REDIRECT_URI = 'http://localhost:5001/api/auth/callback' } = process.env;

if (!WORKOS_API_KEY) {
    throw new Error('WORKOS_API_KEY environment variable is not set');
}

if (!WORKOS_CLIENT_ID) {
    throw new Error('WORKOS_CLIENT_ID environment variable is not set');
}

if (!WORKOS_COOKIE_PASSWORD) {
    throw new Error('WORKOS_COOKIE_PASSWORD environment variable is not set');
}

export const workos = new WorkOS(WORKOS_API_KEY, {
    clientId: WORKOS_CLIENT_ID,
});

export const COOKIE_NAME = 'wos-session';

export const config = {
    apiKey: WORKOS_API_KEY,
    clientId: WORKOS_CLIENT_ID,
    cookiePassword: WORKOS_COOKIE_PASSWORD,
    redirectUri: WORKOS_REDIRECT_URI,
};
