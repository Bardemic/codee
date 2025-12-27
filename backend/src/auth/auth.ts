import { betterAuth } from 'better-auth';
import { Pool } from 'pg';

const { PGHOST = 'localhost', PGPORT = '5432', PGUSER = 'postgres', PGPASSWORD = '', PGDATABASE = 'codee', PGSSL = 'false' } = process.env;

const pool = new Pool({
    host: PGHOST,
    port: Number(PGPORT),
    user: PGUSER,
    password: PGPASSWORD,
    database: PGDATABASE,
    ssl: PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export const auth = betterAuth({
    database: pool,
    baseURL: 'http://localhost:5001',
    basePath: '/api/auth',
    emailAndPassword: {
        enabled: true,
    },
    trustedOrigins: ['http://localhost:5173'],
    advanced: {
        useSecureCookies: false,
        defaultCookieAttributes: {
            sameSite: 'lax',
            path: '/',
        },
    },
});
