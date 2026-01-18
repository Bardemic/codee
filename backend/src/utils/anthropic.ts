import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '../db/entities/Message';
import type {
    MessageParam,
    Tool,
    ContentBlock,
    TextBlockParam,
    ImageBlockParam,
    ToolUseBlockParam,
    ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';

/**
 * Anthropic Claude client wrapper
 * Provides integration with Claude API using custom tools
 */
export class AnthropicClient {
    private client: Anthropic;

    constructor(apiKey?: string) {
        this.client = new Anthropic({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
        });
    }

    /**
     * Transform Vercel AI SDK tool format to Anthropic tool format
     */
    static transformToolToAnthropic(toolName: string, tool: any): Tool {
        // Extract the schema from the tool
        const schema = tool.parameters || tool.schema;

        return {
            name: toolName,
            description: tool.description || '',
            input_schema: {
                type: 'object',
                properties: schema.properties || {},
                required: schema.required || [],
            },
        };
    }

    /**
     * Transform database messages to Anthropic message format
     */
    static transformMessages(messages: Message[]): MessageParam[] {
        const result: MessageParam[] = [];

        for (const message of messages) {
            if (message.sender === 'USER') {
                // User messages with images
                if (message.images && message.images.length > 0) {
                    const content: Array<TextBlockParam | ImageBlockParam> = [
                        { type: 'text', text: message.content } as TextBlockParam,
                    ];

                    for (const image of message.images) {
                        // Ensure media_type is one of the allowed types
                        const mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' =
                            image.mimeType === 'image/jpeg' ||
                            image.mimeType === 'image/png' ||
                            image.mimeType === 'image/gif' ||
                            image.mimeType === 'image/webp'
                                ? image.mimeType
                                : 'image/png'; // Default to PNG if unknown

                        content.push({
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mediaType,
                                data: image.data,
                            },
                        } as ImageBlockParam);
                    }
                    result.push({ role: 'user', content });
                } else {
                    result.push({ role: 'user', content: message.content });
                }
            } else {
                // Assistant messages - handle tool calls
                const toolCalls = message.toolCalls || [];

                if (toolCalls.length > 0) {
                    // Build assistant message with tool use blocks
                    const content: Array<TextBlockParam | ToolUseBlockParam> = [];

                    // Add text if present
                    if (message.content) {
                        content.push({
                            type: 'text',
                            text: message.content,
                        } as TextBlockParam);
                    }

                    // Add tool use blocks
                    for (const toolCall of toolCalls) {
                        content.push({
                            type: 'tool_use',
                            id: `toolu_${toolCall.id}`,
                            name: toolCall.toolName,
                            input: toolCall.arguments,
                        } as ToolUseBlockParam);
                    }

                    result.push({ role: 'assistant', content });

                    // Add tool results as user message
                    const toolResults: ToolResultBlockParam[] = toolCalls.map((toolCall) => ({
                        type: 'tool_result' as const,
                        tool_use_id: `toolu_${toolCall.id}`,
                        content: toolCall.result || '',
                    }));

                    result.push({ role: 'user', content: toolResults });
                } else {
                    // No tool calls, just text
                    result.push({ role: 'assistant', content: message.content });
                }
            }
        }

        return result;
    }

    /**
     * Send a message to Claude with tools
     */
    async sendMessage(params: {
        messages: MessageParam[];
        tools?: Record<string, any>;
        system?: string;
        model?: string;
        maxTokens?: number;
        onUpdate?: (event: any) => void;
    }): Promise<{
        text: string;
        toolCalls: Array<{
            id: string;
            name: string;
            input: Record<string, unknown>;
        }>;
        stopReason: string;
        usage: {
            inputTokens: number;
            outputTokens: number;
        };
    }> {
        const {
            messages,
            tools = {},
            system,
            model = 'claude-sonnet-4-5-20250929',
            maxTokens = 4096,
            onUpdate,
        } = params;

        // Transform tools to Anthropic format
        const anthropicTools: Tool[] = Object.entries(tools).map(([name, tool]) =>
            AnthropicClient.transformToolToAnthropic(name, tool)
        );

        // Create the request parameters
        const requestParams: Anthropic.MessageCreateParams = {
            model,
            max_tokens: maxTokens,
            messages,
            ...(system && { system }),
            ...(anthropicTools.length > 0 && { tools: anthropicTools }),
        };

        // Use streaming for real-time updates
        if (onUpdate) {
            return await this.sendMessageStream({
                model,
                max_tokens: maxTokens,
                messages,
                system,
                tools: anthropicTools,
                onUpdate,
            });
        }

        // Non-streaming request
        const response = await this.client.messages.create(requestParams);

        // Extract text and tool calls
        let text = '';
        const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

        for (const block of response.content) {
            if (block.type === 'text') {
                text += block.text;
            } else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id,
                    name: block.name,
                    input: block.input as Record<string, unknown>,
                });
            }
        }

        return {
            text,
            toolCalls,
            stopReason: response.stop_reason || 'end_turn',
            usage: {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
            },
        };
    }

    /**
     * Send a message with streaming
     */
    private async sendMessageStream(params: {
        model: string;
        max_tokens: number;
        messages: MessageParam[];
        system?: string | TextBlockParam[];
        tools?: Tool[];
        onUpdate: (event: any) => void;
    }): Promise<{
        text: string;
        toolCalls: Array<{
            id: string;
            name: string;
            input: Record<string, unknown>;
        }>;
        stopReason: string;
        usage: {
            inputTokens: number;
            outputTokens: number;
        };
    }> {
        const stream = this.client.messages.stream(params as any);

        let text = '';
        const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

        // Listen to events
        stream.on('text', (textDelta) => {
            text += textDelta;
            params.onUpdate({ type: 'text', text: textDelta });
        });

        stream.on('contentBlock', (block) => {
            if (block.type === 'tool_use') {
                params.onUpdate({ type: 'tool_use', toolUse: block });
            }
        });

        // Wait for completion
        const message = await stream.finalMessage();

        // Extract tool calls from final message
        for (const block of message.content) {
            if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id,
                    name: block.name,
                    input: block.input as Record<string, unknown>,
                });
            }
        }

        return {
            text,
            toolCalls,
            stopReason: message.stop_reason || 'end_turn',
            usage: {
                inputTokens: message.usage.input_tokens,
                outputTokens: message.usage.output_tokens,
            },
        };
    }

    /**
     * Execute a multi-turn conversation with automatic tool calling
     */
    async runWithTools(params: {
        messages: MessageParam[];
        tools: Record<string, any>;
        system?: string;
        model?: string;
        maxTokens?: number;
        maxIterations?: number;
        onUpdate?: (event: any) => void;
    }): Promise<{
        finalText: string;
        allMessages: MessageParam[];
        totalUsage: {
            inputTokens: number;
            outputTokens: number;
        };
    }> {
        const {
            messages: initialMessages,
            tools,
            system,
            model = 'claude-sonnet-4-5-20250929',
            maxTokens = 4096,
            maxIterations = 10,
            onUpdate,
        } = params;

        const messages = [...initialMessages];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let finalText = '';
        let iteration = 0;

        while (iteration < maxIterations) {
            iteration++;

            // Send message
            const response = await this.sendMessage({
                messages,
                tools,
                system,
                model,
                maxTokens,
                onUpdate,
            });

            totalInputTokens += response.usage.inputTokens;
            totalOutputTokens += response.usage.outputTokens;
            finalText = response.text;

            // Build assistant response content
            const assistantContent: Array<TextBlockParam | ToolUseBlockParam> = [];

            if (response.text) {
                assistantContent.push({
                    type: 'text',
                    text: response.text,
                } as TextBlockParam);
            }

            // Add tool uses to assistant message
            for (const toolCall of response.toolCalls) {
                assistantContent.push({
                    type: 'tool_use',
                    id: toolCall.id,
                    name: toolCall.name,
                    input: toolCall.input,
                } as ToolUseBlockParam);
            }

            messages.push({ role: 'assistant', content: assistantContent });

            // If no tool calls, we're done
            if (response.toolCalls.length === 0) {
                break;
            }

            // Execute tools
            const toolResults: ToolResultBlockParam[] = [];

            for (const toolCall of response.toolCalls) {
                const tool = tools[toolCall.name];
                if (!tool) {
                    console.warn(`Tool ${toolCall.name} not found`);
                    toolResults.push({
                        type: 'tool_result' as const,
                        tool_use_id: toolCall.id,
                        content: `Error: Tool ${toolCall.name} not found`,
                    });
                    continue;
                }

                try {
                    // Execute the tool
                    const result = await tool.execute(toolCall.input);
                    const resultString = typeof result === 'string' ? result : JSON.stringify(result);

                    toolResults.push({
                        type: 'tool_result' as const,
                        tool_use_id: toolCall.id,
                        content: resultString,
                    });

                    if (onUpdate) {
                        onUpdate({
                            type: 'tool_result',
                            toolName: toolCall.name,
                            result: resultString,
                        });
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    toolResults.push({
                        type: 'tool_result' as const,
                        tool_use_id: toolCall.id,
                        content: `Error: ${errorMessage}`,
                    });
                }
            }

            // Add tool results as user message
            messages.push({ role: 'user', content: toolResults });
        }

        return {
            finalText,
            allMessages: messages,
            totalUsage: {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
            },
        };
    }
}

/**
 * Create a singleton Anthropic client instance
 */
let globalAnthropicClient: AnthropicClient | null = null;

export function getAnthropicClient(): AnthropicClient {
    if (!globalAnthropicClient) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY environment variable is required');
        }
        globalAnthropicClient = new AnthropicClient(apiKey);
    }
    return globalAnthropicClient;
}
