import { browserSessions, consoleLogs, networkLogs } from './session';
import { buildCreateSessionTool } from './tools/createSession';
import { buildScreenshotTool } from './tools/screenshot';
import { buildExecuteTool } from './tools/execute';
import { buildNavigateTool } from './tools/navigate';
import { buildClickTool } from './tools/click';
import { buildTypeTool } from './tools/type';
import { buildGetConsoleLogsTool } from './tools/getConsoleLogs';
import { buildGetNetworkLogsTool } from './tools/getNetworkLogs';
import { buildGetPageContentTool } from './tools/getPageContent';
import { buildWaitForPageTool } from './tools/waitForPage';

export type { BrowserToolResult } from './session';

export interface SandboxUrl {
    port: number;
    url: string;
}

export function buildBrowserTools(params: { agentId: number; sandboxUrls?: SandboxUrl[] }) {
    const { agentId, sandboxUrls } = params;

    return {
        browser_create_session: buildCreateSessionTool({ agentId, sandboxUrls }),
        browser_screenshot: buildScreenshotTool({ agentId }),
        browser_execute: buildExecuteTool({ agentId }),
        browser_navigate: buildNavigateTool({ agentId }),
        browser_click: buildClickTool({ agentId }),
        browser_type: buildTypeTool({ agentId }),
        browser_get_console_logs: buildGetConsoleLogsTool({ agentId }),
        browser_get_network_logs: buildGetNetworkLogsTool({ agentId }),
        browser_get_page_content: buildGetPageContentTool({ agentId }),
        browser_wait_for_page: buildWaitForPageTool({ agentId }),
    };
}

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
    consoleLogs.delete(agentId);
    networkLogs.delete(agentId);
}
