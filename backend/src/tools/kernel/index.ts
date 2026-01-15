import type { Sandbox } from '@vercel/sandbox';
import { browserSessions, consoleLogs, networkLogs } from './session';
import { buildStartDevServerTool } from './tools/startDevServer';
import { buildCreateSessionTool } from './tools/createSession';
import { buildScreenshotTool } from './tools/screenshot';
import { buildExecuteTool } from './tools/execute';
import { buildNavigateTool } from './tools/navigate';
import { buildClickTool } from './tools/click';
import { buildTypeTool } from './tools/type';
import { buildCloseSessionTool } from './tools/closeSession';
import { buildGetConsoleLogsTool } from './tools/getConsoleLogs';
import { buildGetNetworkLogsTool } from './tools/getNetworkLogs';
import { buildGetPageContentTool } from './tools/getPageContent';
import { buildWaitForPageTool } from './tools/waitForPage';

export type { BrowserToolResult } from './session';

export function buildBrowserTools(params: { agentId: number; sandbox: Sandbox }) {
    const { agentId, sandbox } = params;

    return {
        browser_start_dev_server: buildStartDevServerTool({ agentId, sandbox }),
        browser_create_session: buildCreateSessionTool({ agentId }),
        browser_screenshot: buildScreenshotTool({ agentId }),
        browser_execute: buildExecuteTool({ agentId }),
        browser_navigate: buildNavigateTool({ agentId }),
        browser_click: buildClickTool({ agentId }),
        browser_type: buildTypeTool({ agentId }),
        browser_close_session: buildCloseSessionTool({ agentId }),
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
