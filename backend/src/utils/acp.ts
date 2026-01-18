import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import {
    ClientSideConnection,
    ndJsonStream,
    type Stream,
    type SessionNotification,
    type ContentBlock,
    type Agent,
} from '@agentclientprotocol/sdk';
import type { Message } from '../db/entities/Message';
import type { ToolCall } from '../db/entities/ToolCall';

/**
 * ACP Client for Claude Code Agent
 * This class manages the connection to the Claude Code agent via ACP
 */
export class ACPClient {
    private connection: ClientSideConnection | null = null;
    private process: ReturnType<typeof spawn> | null = null;
    private sessionId: string | null = null;
    private sessionUpdateHandlers: Map<string, (notification: SessionNotification) => void> = new Map();

    constructor(private apiKey?: string, private authToken?: string, private baseUrl?: string) {
        if (!apiKey && !authToken) {
            throw new Error('Anthropic credentials are required for ACP client');
        }
    }

    /**
     * Initialize the ACP connection to Claude Code
     */
    async initialize(): Promise<void> {
        if (this.connection) {
            return; // Already initialized
        }

        // Spawn the Claude Code ACP process
        const env = {
            ...process.env,
            ...(this.baseUrl ? { ANTHROPIC_BASE_URL: this.baseUrl } : {}),
            ...(this.authToken ? { ANTHROPIC_AUTH_TOKEN: this.authToken } : {}),
            ANTHROPIC_API_KEY: this.apiKey ?? '',
        };

        this.process = spawn('claude-code-acp', [], {
            stdio: ['pipe', 'pipe', 'inherit'],
            env,
        });

        if (!this.process.stdin || !this.process.stdout) {
            throw new Error('Failed to create stdin/stdout pipes for Claude Code ACP');
        }

        // Create the ACP stream
        const input = Writable.toWeb(this.process.stdin);
        const output = Readable.toWeb(this.process.stdout);
        const stream = ndJsonStream(input, output);

        // Create client-side connection with client implementation
        this.connection = new ClientSideConnection((agent: Agent) => {
            return {
                sessionUpdate: async (params: SessionNotification) => {
                    // Handle session updates
                    const handler = this.sessionUpdateHandlers.get(params.sessionId);
                    if (handler) {
                        handler(params);
                    }
                },
                requestPermission: async (params) => {
                    // Auto-select the first available permission option
                    const firstOption = params.options[0];
                    return {
                        outcome: {
                            outcome: 'selected' as const,
                            optionId: firstOption?.optionId || '',
                        },
                    };
                },
            };
        }, stream as Stream);

        // Initialize the connection
        await this.connection.initialize({
            clientInfo: {
                name: 'Codee',
                version: '1.0.0',
            },
            protocolVersion: 1,
        });
    }

    /**
     * Create a new session with the agent
     */
    async createSession(workingDirectory?: string): Promise<string> {
        if (!this.connection) {
            await this.initialize();
        }

        // Create a new session
        const response = await this.connection!.newSession({
            cwd: workingDirectory || process.cwd(),
            mcpServers: [], // No MCP servers by default
        });

        this.sessionId = response.sessionId;
        return response.sessionId;
    }

    /**
     * Send a message to the agent and get a response
     */
    async sendMessage(
        content: string,
        images: Array<{ data: string; mimeType: string }> = [],
        systemPrompt?: string,
        onUpdate?: (update: SessionNotification) => void
    ): Promise<{
        text: string;
        stopReason: string;
        updates: SessionNotification[];
    }> {
        if (!this.connection) {
            await this.initialize();
        }

        if (!this.sessionId) {
            await this.createSession();
        }

        // Build the prompt content blocks
        const promptBlocks: ContentBlock[] = [];

        // Add system prompt as context if provided
        if (systemPrompt) {
            promptBlocks.push({
                type: 'text',
                text: `System: ${systemPrompt}\n\nUser: ${content}`,
            });
        } else {
            promptBlocks.push({
                type: 'text',
                text: content,
            });
        }

        // Add images if present
        for (const image of images) {
            promptBlocks.push({
                type: 'image',
                data: image.data,
                mimeType: image.mimeType,
            });
        }

        // Collect session updates
        const updates: SessionNotification[] = [];
        let fullText = '';

        // Set up session update handler
        if (this.sessionId) {
            this.sessionUpdateHandlers.set(this.sessionId, (notification) => {
                updates.push(notification);

                // Extract text from content chunks
                if (notification.update.sessionUpdate === 'agent_message_chunk') {
                    const chunk = notification.update as any; // ContentChunk type
                    if (chunk.content?.type === 'text' && chunk.content?.text) {
                        fullText += chunk.content.text;
                    }
                }

                // Call the update callback if provided
                if (onUpdate) {
                    onUpdate(notification);
                }
            });
        }

        // Send the prompt
        const response = await this.connection!.prompt({
            sessionId: this.sessionId!,
            prompt: promptBlocks,
        });

        // Clean up the handler
        if (this.sessionId) {
            this.sessionUpdateHandlers.delete(this.sessionId);
        }

        return {
            text: fullText,
            stopReason: response.stopReason,
            updates,
        };
    }

    /**
     * Stream a message to the agent with real-time updates
     */
    async *streamMessage(
        content: string,
        images: Array<{ data: string; mimeType: string }> = [],
        systemPrompt?: string
    ): AsyncGenerator<SessionNotification> {
        // Use sendMessage with an async iterator to stream updates
        const updateQueue: SessionNotification[] = [];
        let resolveNext: ((value: SessionNotification | null) => void) | null = null;
        let done = false;

        // Send the message and collect updates
        const promise = this.sendMessage(content, images, systemPrompt, (update) => {
            if (resolveNext) {
                resolveNext(update);
                resolveNext = null;
            } else {
                updateQueue.push(update);
            }
        });

        // Stream the updates
        while (!done) {
            let update: SessionNotification | null = null;

            if (updateQueue.length > 0) {
                update = updateQueue.shift()!;
            } else {
                update = await new Promise<SessionNotification | null>((resolve) => {
                    resolveNext = resolve;
                    // Check if the promise is complete
                    promise.then(() => {
                        done = true;
                        if (resolveNext) {
                            resolveNext(null);
                        }
                    });
                });
            }

            if (update) {
                yield update;
            } else {
                break;
            }
        }

        // Wait for the final result
        await promise;
    }

    /**
     * Close the ACP connection
     */
    async close(): Promise<void> {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        this.connection = null;
        this.sessionId = null;
    }

    /**
     * Transform database messages to ACP ContentBlock format
     */
    static transformMessagesToContentBlocks(messages: Message[]): ContentBlock[] {
        const blocks: ContentBlock[] = [];

        for (const message of messages) {
            const role = message.sender === 'USER' ? 'User' : 'Assistant';

            // Add the text content
            blocks.push({
                type: 'text',
                text: `${role}: ${message.content}`,
            });

            // Add images if present
            if (message.images && message.images.length > 0) {
                for (const image of message.images) {
                    blocks.push({
                        type: 'image',
                        data: image.data,
                        mimeType: image.mimeType,
                    });
                }
            }
        }

        return blocks;
    }

    /**
     * Send a message with conversation history
     */
    async sendMessageWithHistory(
        content: string,
        images: Array<{ data: string; mimeType: string }> = [],
        previousMessages: Message[] = [],
        systemPrompt?: string,
        onUpdate?: (update: SessionNotification) => void
    ): Promise<{
        text: string;
        stopReason: string;
        updates: SessionNotification[];
    }> {
        if (!this.connection) {
            await this.initialize();
        }

        if (!this.sessionId) {
            await this.createSession();
        }

        // Build the prompt content blocks
        const promptBlocks: ContentBlock[] = [];

        // Add system prompt if provided
        if (systemPrompt) {
            promptBlocks.push({
                type: 'text',
                text: `System: ${systemPrompt}`,
            });
        }

        // Add previous messages as context
        if (previousMessages.length > 0) {
            promptBlocks.push(...ACPClient.transformMessagesToContentBlocks(previousMessages));
        }

        // Add current message
        promptBlocks.push({
            type: 'text',
            text: `User: ${content}`,
        });

        // Add images if present
        for (const image of images) {
            promptBlocks.push({
                type: 'image',
                data: image.data,
                mimeType: image.mimeType,
            });
        }

        // Collect session updates
        const updates: SessionNotification[] = [];
        let fullText = '';

        // Set up session update handler
        if (this.sessionId) {
            this.sessionUpdateHandlers.set(this.sessionId, (notification) => {
                updates.push(notification);

                // Extract text from content chunks
                if (notification.update.sessionUpdate === 'agent_message_chunk') {
                    const chunk = notification.update as any; // ContentChunk type
                    if (chunk.content?.type === 'text' && chunk.content?.text) {
                        fullText += chunk.content.text;
                    }
                }

                // Call the update callback if provided
                if (onUpdate) {
                    onUpdate(notification);
                }
            });
        }

        // Send the prompt
        const response = await this.connection!.prompt({
            sessionId: this.sessionId!,
            prompt: promptBlocks,
        });

        // Clean up the handler
        if (this.sessionId) {
            this.sessionUpdateHandlers.delete(this.sessionId);
        }

        return {
            text: fullText,
            stopReason: response.stopReason,
            updates,
        };
    }
}

/**
 * Create a singleton ACP client instance
 */
let globalACPClient: ACPClient | null = null;

export function getACPClient(): ACPClient {
    if (!globalACPClient) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        const authToken = process.env.ANTHROPIC_AUTH_TOKEN || process.env.OPENROUTER_API_KEY;
        const baseUrl = process.env.ANTHROPIC_BASE_URL;
        if (!apiKey && !authToken) {
            throw new Error('ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN/OPENROUTER_API_KEY environment variable is required');
        }
        globalACPClient = new ACPClient(apiKey, authToken, baseUrl);
    }
    return globalACPClient;
}

/**
 * Close the global ACP client
 */
export async function closeACPClient(): Promise<void> {
    if (globalACPClient) {
        await globalACPClient.close();
        globalACPClient = null;
    }
}
