import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import type { Sandbox } from '@vercel/sandbox';
import Kernel from '@onkernel/sdk';
import { emitStatus } from '../../stream/events';
import type { ToolCallImage } from '../../db/entities/ToolCall';

// Module-level state for browser session per agent
const browserSessions: Map<number, { sessionId: string; client: Kernel }> = new Map();

// Store console logs and network requests for each agent session
const consoleLogs: Map<number, Array<{ type: string; text: string; timestamp: string }>> = new Map();
const networkLogs: Map<number, Array<{ method: string; url: string; status?: number; timestamp: string }>> = new Map();

function getKernelClient(): Kernel {
    const apiKey = process.env.KERNEL_API_KEY;
    if (!apiKey) {
        throw new Error('KERNEL_API_KEY environment variable is not set');
    }
    return new Kernel({ apiKey });
}

export type BrowserToolResult = {
    text: string;
    images?: ToolCallImage[];
};

export function buildBrowserTools(params: { agentId: number; sandbox: Sandbox }) {
    const { agentId, sandbox } = params;

    // Tool schemas
    const startDevServerSchema = z.object({
        command: z.string().describe('Command to start the dev server (e.g., "npm run dev", "bun dev")'),
        port: z.number().describe('Port the dev server will run on (e.g., 3000)'),
    });

    const createSessionSchema = z.object({
        url: z.string().optional().describe('Optional initial URL to navigate to after creating the browser'),
    });

    const screenshotSchema = z.object({});

    const executeSchema = z.object({
        code: z.string().describe('Playwright/JavaScript code to execute. Has access to `page`, `context`, and `browser` variables.'),
        timeout_sec: z.number().optional().default(60).describe('Execution timeout in seconds'),
    });

    const navigateSchema = z.object({
        url: z.string().describe('URL to navigate to'),
    });

    const clickSchema = z.object({
        selector: z.string().describe('CSS selector for the element to click'),
    });

    const typeSchema = z.object({
        selector: z.string().describe('CSS selector for the input element'),
        text: z.string().describe('Text to type into the element'),
    });

    const closeSessionSchema = z.object({});

    const getConsoleLogsSchema = z.object({
        clear: z.boolean().optional().default(false).describe('Whether to clear the logs after retrieving them'),
    });

    const getNetworkLogsSchema = z.object({
        clear: z.boolean().optional().default(false).describe('Whether to clear the logs after retrieving them'),
    });

    const getPageContentSchema = z.object({
        format: z.enum(['html', 'text']).optional().default('text').describe('Format to return: "html" for full HTML, "text" for visible text only'),
    });

    const waitForPageLoadSchema = z.object({
        selector: z.string().optional().describe('Optional CSS selector to wait for'),
        timeout_sec: z.number().optional().default(30).describe('Timeout in seconds'),
    });

    // Tools
    const browser_start_dev_server = tool({
        description: 'Start a development server in the sandbox and expose it via a public URL. Use this before browser_create_session to make your app accessible to the browser.',
        inputSchema: zodSchema(startDevServerSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { command, port } = input;
            await emitStatus(agentId, 'running', 'tool_browser_start_dev_server', `Starting dev server: ${command}`, { arguments: input });

            // Start the dev server in detached mode
            await sandbox.runCommand({
                cmd: 'bash',
                args: ['-c', command],
                detached: true,
            });

            // Get the public URL for the port
            const publicUrl = sandbox.domain(port);

            // Poll for server readiness (up to 60 seconds)
            const maxAttempts = 30;
            let serverReady = false;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                try {
                    const response = await fetch(publicUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
                    if (response.ok || response.status < 500) {
                        serverReady = true;
                        break;
                    }
                } catch {
                    // Server not ready yet, continue polling
                }
                if (attempt % 5 === 0) {
                    await emitStatus(agentId, 'running', 'tool_browser_start_dev_server', `Waiting for server to start... (${(attempt + 1) * 2}s)`, { arguments: input });
                }
            }

            if (!serverReady) {
                return {
                    text: `Dev server started but may not be ready yet. Public URL: ${publicUrl}\nNote: The server did not respond within 60 seconds. It may still be starting up or there could be an issue with the application.`,
                };
            }

            await emitStatus(agentId, 'running', 'tool_browser_start_dev_server', `Dev server started at ${publicUrl}`, { arguments: input });

            return {
                text: `Dev server started successfully and is responding. Public URL: ${publicUrl}`,
            };
        },
    });

    const browser_create_session = tool({
        description: 'Create a new browser session using Kernel.sh. This starts a remote browser that can be controlled via other browser tools. Call browser_start_dev_server first if you need to access an app running in the sandbox.',
        inputSchema: zodSchema(createSessionSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { url } = input;
            await emitStatus(agentId, 'running', 'tool_browser_create_session', 'Creating browser session', { arguments: input });

            const client = getKernelClient();
            const browserResponse = await client.browsers.create({
                headless: false,
                timeout_seconds: 300, // 5 minutes
            });

            const sessionId = browserResponse.session_id;

            // Store the session for this agent
            browserSessions.set(agentId, { sessionId, client });

            // Initialize log storage for this agent
            consoleLogs.set(agentId, []);
            networkLogs.set(agentId, []);

            // Set up console and network logging via Playwright
            await client.browsers.playwright.execute(sessionId, {
                code: `
                    // Store logs in page context for later retrieval
                    window.__consoleLogs = window.__consoleLogs || [];
                    window.__networkLogs = window.__networkLogs || [];
                    
                    // Capture console messages
                    const originalConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };
                    ['log', 'warn', 'error', 'info'].forEach(type => {
                        console[type] = function(...args) {
                            window.__consoleLogs.push({ type, text: args.map(a => String(a)).join(' '), timestamp: new Date().toISOString() });
                            originalConsole[type].apply(console, args);
                        };
                    });
                    
                    // Capture network requests via Performance API
                    const observer = new PerformanceObserver((list) => {
                        for (const entry of list.getEntries()) {
                            if (entry.entryType === 'resource') {
                                window.__networkLogs.push({
                                    method: 'GET',
                                    url: entry.name,
                                    status: 200,
                                    timestamp: new Date().toISOString()
                                });
                            }
                        }
                    });
                    observer.observe({ entryTypes: ['resource'] });
                `,
                timeout_sec: 10,
            });

            let result = `Browser session created. Session ID: ${sessionId}`;
            if (browserResponse.browser_live_view_url) {
                result += `\nLive view URL: ${browserResponse.browser_live_view_url}`;
            }
            result += `\nConsole and network logging enabled. Use browser_get_console_logs and browser_get_network_logs to retrieve logs.`;

            // Navigate to initial URL if provided
            if (url) {
                await client.browsers.playwright.execute(sessionId, {
                    code: `await page.goto('${url}', { waitUntil: 'domcontentloaded', timeout: 30000 });`,
                    timeout_sec: 35,
                });
                // Wait a bit more for JS to execute
                await client.browsers.playwright.execute(sessionId, {
                    code: `await page.waitForTimeout(2000);`,
                    timeout_sec: 10,
                });
                result += `\nNavigated to: ${url}`;
            }

            await emitStatus(agentId, 'running', 'tool_browser_create_session', result, { arguments: input });

            return { text: result };
        },
    });

    const browser_screenshot = tool({
        description: 'Capture a screenshot of the current browser page. The screenshot will be stored and can be viewed in the tool call history.',
        inputSchema: zodSchema(screenshotSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            await emitStatus(agentId, 'running', 'tool_browser_screenshot', 'Capturing screenshot', { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            // Capture screenshot - returns Response with blob
            const response = await client.browsers.computer.captureScreenshot(sessionId);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');

            const image: ToolCallImage = {
                data: base64,
                mimeType: 'image/png',
            };

            await emitStatus(agentId, 'running', 'tool_browser_screenshot', 'Screenshot captured', { arguments: input });

            return {
                text: 'Screenshot captured successfully.',
                images: [image],
            };
        },
    });

    const browser_execute = tool({
        description: 'Execute arbitrary Playwright code in the browser. Has access to `page`, `context`, and `browser` variables. Use this for complex interactions not covered by other tools.',
        inputSchema: zodSchema(executeSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { code, timeout_sec } = input;
            await emitStatus(agentId, 'running', 'tool_browser_execute', `Executing Playwright code`, { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            const result = await client.browsers.playwright.execute(sessionId, {
                code,
                timeout_sec: timeout_sec || 60,
            });

            await emitStatus(agentId, 'running', 'tool_browser_execute', 'Code executed', { arguments: input });

            return {
                text: result.result !== undefined ? `Execution result: ${JSON.stringify(result.result)}` : 'Code executed successfully.',
            };
        },
    });

    const browser_navigate = tool({
        description: 'Navigate the browser to a specific URL. Waits for page to load.',
        inputSchema: zodSchema(navigateSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { url } = input;
            await emitStatus(agentId, 'running', 'tool_browser_navigate', `Navigating to ${url}`, { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            // Use domcontentloaded first, then wait for additional JS execution
            await client.browsers.playwright.execute(sessionId, {
                code: `
                    await page.goto('${url}', { waitUntil: 'domcontentloaded', timeout: 30000 });
                    // Wait for any pending JS to execute
                    await page.waitForTimeout(2000);
                    // Try to wait for network idle, but don't fail if it times out
                    try {
                        await page.waitForLoadState('networkidle', { timeout: 5000 });
                    } catch (e) {
                        // Page may have continuous network activity, that's okay
                    }
                `,
                timeout_sec: 45,
            });

            await emitStatus(agentId, 'running', 'tool_browser_navigate', `Navigated to ${url}`, { arguments: input });

            return { text: `Successfully navigated to ${url}` };
        },
    });

    const browser_click = tool({
        description: 'Click on an element in the browser using a CSS selector.',
        inputSchema: zodSchema(clickSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { selector } = input;
            await emitStatus(agentId, 'running', 'tool_browser_click', `Clicking ${selector}`, { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            await client.browsers.playwright.execute(sessionId, {
                code: `await page.click('${selector.replace(/'/g, "\\'")}');`,
                timeout_sec: 30,
            });

            await emitStatus(agentId, 'running', 'tool_browser_click', `Clicked ${selector}`, { arguments: input });

            return { text: `Successfully clicked on element: ${selector}` };
        },
    });

    const browser_type = tool({
        description: 'Type text into an input element in the browser.',
        inputSchema: zodSchema(typeSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { selector, text } = input;
            await emitStatus(agentId, 'running', 'tool_browser_type', `Typing into ${selector}`, { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            await client.browsers.playwright.execute(sessionId, {
                code: `await page.fill('${selector.replace(/'/g, "\\'")}', '${text.replace(/'/g, "\\'")}');`,
                timeout_sec: 30,
            });

            await emitStatus(agentId, 'running', 'tool_browser_type', `Typed into ${selector}`, { arguments: input });

            return { text: `Successfully typed "${text}" into element: ${selector}` };
        },
    });

    const browser_close_session = tool({
        description: 'Close the current browser session and clean up resources.',
        inputSchema: zodSchema(closeSessionSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            await emitStatus(agentId, 'running', 'tool_browser_close_session', 'Closing browser session', { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'No browser session to close.' };
            }

            const { sessionId, client } = session;

            await client.browsers.deleteByID(sessionId);
            browserSessions.delete(agentId);
            consoleLogs.delete(agentId);
            networkLogs.delete(agentId);

            await emitStatus(agentId, 'running', 'tool_browser_close_session', 'Browser session closed', { arguments: input });

            return { text: 'Browser session closed successfully.' };
        },
    });

    const browser_get_console_logs = tool({
        description: 'Get console logs (log, warn, error, info) captured from the browser. Useful for debugging JavaScript errors and application behavior.',
        inputSchema: zodSchema(getConsoleLogsSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { clear } = input;
            await emitStatus(agentId, 'running', 'tool_browser_get_console_logs', 'Retrieving console logs', { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            // Retrieve console logs from the page
            const result = await client.browsers.playwright.execute(sessionId, {
                code: `
                    const logs = window.__consoleLogs || [];
                    if (${clear}) {
                        window.__consoleLogs = [];
                    }
                    return logs;
                `,
                timeout_sec: 10,
            });

            const logs = (result.result as Array<{ type: string; text: string; timestamp: string }>) || [];

            if (logs.length === 0) {
                return { text: 'No console logs captured.' };
            }

            const formattedLogs = logs
                .map((log) => `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.text}`)
                .join('\n');

            await emitStatus(agentId, 'running', 'tool_browser_get_console_logs', `Retrieved ${logs.length} console logs`, { arguments: input });

            return { text: `Console Logs (${logs.length} entries):\n${formattedLogs}` };
        },
    });

    const browser_get_network_logs = tool({
        description: 'Get network request logs captured from the browser. Useful for debugging API calls, failed requests, and resource loading.',
        inputSchema: zodSchema(getNetworkLogsSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { clear } = input;
            await emitStatus(agentId, 'running', 'tool_browser_get_network_logs', 'Retrieving network logs', { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            // Retrieve network logs from the page
            const result = await client.browsers.playwright.execute(sessionId, {
                code: `
                    const logs = window.__networkLogs || [];
                    if (${clear}) {
                        window.__networkLogs = [];
                    }
                    return logs;
                `,
                timeout_sec: 10,
            });

            const logs = (result.result as Array<{ method: string; url: string; status?: number; timestamp: string }>) || [];

            if (logs.length === 0) {
                return { text: 'No network logs captured.' };
            }

            const formattedLogs = logs
                .map((log) => `[${log.timestamp}] ${log.method} ${log.url} ${log.status ? `(${log.status})` : ''}`)
                .join('\n');

            await emitStatus(agentId, 'running', 'tool_browser_get_network_logs', `Retrieved ${logs.length} network logs`, { arguments: input });

            return { text: `Network Logs (${logs.length} entries):\n${formattedLogs}` };
        },
    });

    const browser_get_page_content = tool({
        description: 'Get the current page content as HTML or visible text. Useful for understanding what the browser is displaying and debugging rendering issues.',
        inputSchema: zodSchema(getPageContentSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { format } = input;
            await emitStatus(agentId, 'running', 'tool_browser_get_page_content', `Getting page content as ${format}`, { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            const code = format === 'html' 
                ? `return await page.content();`
                : `return await page.innerText('body');`;

            const result = await client.browsers.playwright.execute(sessionId, {
                code,
                timeout_sec: 15,
            });

            const content = (result.result as string) || '';

            // Truncate if too long
            const maxLength = 50000;
            const truncated = content.length > maxLength;
            const displayContent = truncated ? content.substring(0, maxLength) + '\n\n... (content truncated)' : content;

            await emitStatus(agentId, 'running', 'tool_browser_get_page_content', `Retrieved page ${format}`, { arguments: input });

            return { text: `Page ${format.toUpperCase()} Content:\n${displayContent}` };
        },
    });

    const browser_wait_for_page = tool({
        description: 'Wait for the page to finish loading or for a specific element to appear. Use this after navigation if you need to ensure content is fully rendered.',
        inputSchema: zodSchema(waitForPageLoadSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { selector, timeout_sec } = input;
            await emitStatus(agentId, 'running', 'tool_browser_wait_for_page', selector ? `Waiting for ${selector}` : 'Waiting for page load', { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            try {
                if (selector) {
                    await client.browsers.playwright.execute(sessionId, {
                        code: `await page.waitForSelector('${selector.replace(/'/g, "\\'")}', { timeout: ${(timeout_sec || 30) * 1000} });`,
                        timeout_sec: (timeout_sec || 30) + 5,
                    });
                    return { text: `Element "${selector}" found and visible.` };
                } else {
                    await client.browsers.playwright.execute(sessionId, {
                        code: `
                            await page.waitForLoadState('domcontentloaded', { timeout: ${(timeout_sec || 30) * 1000} });
                            await page.waitForTimeout(1000);
                            try {
                                await page.waitForLoadState('networkidle', { timeout: 5000 });
                            } catch (e) {
                                // Network may not be idle, that's okay
                            }
                        `,
                        timeout_sec: (timeout_sec || 30) + 10,
                    });
                    return { text: 'Page finished loading.' };
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                return { text: `Timeout waiting for page: ${message}` };
            }
        },
    });

    return {
        browser_start_dev_server,
        browser_create_session,
        browser_screenshot,
        browser_execute,
        browser_navigate,
        browser_click,
        browser_type,
        browser_close_session,
        browser_get_console_logs,
        browser_get_network_logs,
        browser_get_page_content,
        browser_wait_for_page,
    };
}

// Cleanup function to be called when agent workflow ends
export async function cleanupBrowserSession(agentId: number): Promise<void> {
    const session = browserSessions.get(agentId);
    if (session) {
        try {
            await session.client.browsers.deleteByID(session.sessionId);
        } catch {
            // Ignore cleanup errors
        }
        browserSessions.delete(agentId);
    }
    // Clean up log storage
    consoleLogs.delete(agentId);
    networkLogs.delete(agentId);
}
