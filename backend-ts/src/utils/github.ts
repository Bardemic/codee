import crypto from 'crypto';

const GITHUB_APP_ID = process.env.GITHUB_APP_ID || '';
const GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY ? process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n') : '';

export function generateGitHubAppJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iat: now - 60,
        exp: now + 10 * 60,
        iss: GITHUB_APP_ID,
    };
    const header = { alg: 'RS256', typ: 'JWT' };
    const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const headerEncoded = base64url(JSON.stringify(header));
    const payloadEncoded = base64url(JSON.stringify(payload));
    const toSign = `${headerEncoded}.${payloadEncoded}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(toSign);
    const signature = signer.sign(GITHUB_PRIVATE_KEY);
    const signatureEncoded = base64url(signature);
    return `${toSign}.${signatureEncoded}`;
}

export async function getInstallationToken(installationId: string): Promise<string | null> {
    try {
        const jwt = generateGitHubAppJwt();
        const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: 'application/vnd.github+json',
            },
        });
        if (!res.ok) return null;
        const json = (await res.json()) as { token: string };
        return json.token;
    } catch (err) {
        console.warn('github token error', err);
        return null;
    }
}
