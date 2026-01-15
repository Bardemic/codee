import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { emitStatus } from '../../../stream/events';
import { browserSessions, consoleLogs, networkLogs, getKernelClient, type BrowserToolResult } from '../session';

const createSessionSchema = z.object({
    url: z.string().describe('Initial URL to navigate to after creating the browser'),
});

export function buildCreateSessionTool(params: { agentId: number }) {
    const { agentId } = params;

    return tool({
        description:
            'Create a new browser session using Kernel.sh. This starts a remote browser that can be controlled via other browser tools. Call browser_start_dev_server first if you need to access an app running in the sandbox.',
        inputSchema: zodSchema(createSessionSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { url } = input;
            await emitStatus(agentId, 'running', 'tool_browser_create_session', 'Creating browser session', { arguments: input });

            const client = getKernelClient();
            const browserResponse = await client.browsers.create({
                headless: false,
                timeout_seconds: 300,
            });

            const sessionId = browserResponse.session_id;

            browserSessions.set(agentId, { sessionId, client });

            consoleLogs.set(agentId, []);
            networkLogs.set(agentId, []);

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

            if (url) {
                await client.browsers.playwright.execute(sessionId, {
                    code: `await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 30000 });`,
                    timeout_sec: 35,
                });
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
}
