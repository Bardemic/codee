import Kernel from '@onkernel/sdk';
import type { ToolCallImage } from '../../db/entities/ToolCall';

export interface BrowserSession {
    sessionId: string;
    client: Kernel;
}

export type BrowserToolResult = {
    text: string;
    images?: ToolCallImage[];
};

export const browserSessions: Map<number, BrowserSession> = new Map();
export const consoleLogs: Map<number, Array<{ type: string; text: string; timestamp: string }>> = new Map();
export const networkLogs: Map<number, Array<{ method: string; url: string; status?: number; timestamp: string }>> = new Map();

export function getKernelClient(): Kernel {
    const apiKey = process.env.KERNEL_API_KEY;
    if (!apiKey) {
        throw new Error('KERNEL_API_KEY environment variable is not set');
    }
    return new Kernel({ apiKey });
}
