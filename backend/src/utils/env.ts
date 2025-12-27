/**
 * Environment variable validation
 * Ensures all required environment variables are set at startup
 */

const { PGHOST, PGPORT, PGUSER, PGDATABASE } = process.env;

export function validateEnvironment() {
    const errors: string[] = [];

    // Database
    if (!PGHOST) errors.push('PGHOST environment variable is required');
    if (!PGPORT) errors.push('PGPORT environment variable is required');
    if (!PGUSER) errors.push('PGUSER environment variable is required');
    if (!PGDATABASE) errors.push('PGDATABASE environment variable is required');

    // GitHub
    if (!process.env.GITHUB_APP_ID) errors.push('GITHUB_APP_ID environment variable is required');
    if (!process.env.GITHUB_PRIVATE_KEY) errors.push('GITHUB_PRIVATE_KEY environment variable is required');

    // Better Auth
    // if (!process.env.BETTER_AUTH_SECRET) errors.push('BETTER_AUTH_SECRET environment variable is required');

    // Vercel (for sandbox functionality)
    if (!process.env.VERCEL_TOKEN) errors.push('VERCEL_TOKEN environment variable is required');
    if (!process.env.VERCEL_TEAM_ID) errors.push('VERCEL_TEAM_ID environment variable is required');
    if (!process.env.VERCEL_PROJECT_ID) errors.push('VERCEL_PROJECT_ID environment variable is required');

    // Redis
    if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
        errors.push('REDIS_URL or REDIS_HOST environment variable is required');
    }

    // Optional: PostHog
    if (!process.env.POSTHOG_API_KEY) {
        console.warn('POSTHOG_API_KEY not set - analytics will be disabled');
    }

    if (errors.length > 0) {
        console.error('Missing required environment variables:');
        errors.forEach((error) => console.error(`  - ${error}`));
        process.exit(1);
    }
}
