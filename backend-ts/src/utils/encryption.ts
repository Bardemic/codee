import crypto from 'crypto';

const RAW_KEY = process.env.FERNET_KEY || 'dev-fernet-key-dev-fernet-key-32';
const KEY = crypto.createHash('sha256').update(RAW_KEY).digest();

export function encryptData(data: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptData(payload: string): string {
    try {
        const buf = Buffer.from(payload, 'base64');
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const content = buf.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
        return decrypted.toString('utf8');
    } catch {
        return '';
    }
}
