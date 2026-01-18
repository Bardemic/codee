/**
 * Browser automation tools for MCP server
 * These tools use OnKernel SDK for browser automation
 */

import Kernel from "@onkernel/sdk";
import type { McpTool, McpToolResult } from "../../types";
import { formatErrorMessage } from "../../utils";

/**
 * Browser session storage
 */
interface BrowserSession {
  sessionId: string;
  client: Kernel;
}

const browserSessions = new Map<string, BrowserSession>();
const consoleLogs = new Map<string, Array<{ type: string; text: string; timestamp: string }>>();
const networkLogs = new Map<
  string,
  Array<{ method: string; url: string; status?: number; timestamp: string }>
>();

/**
 * Get Kernel client instance
 */
function getKernelClient(apiKey: string): Kernel {
  if (!apiKey) {
    throw new Error("KERNEL_API_KEY is required for browser tools");
  }
  return new Kernel({ apiKey });
}

/**
 * Build browser tools for the MCP server
 */
export function buildBrowserTools(opts: {
  agentId: string;
  apiKey: string;
  sandboxUrls?: Array<{ port: number; url: string }>;
}): McpTool[] {
  const { agentId, apiKey, sandboxUrls = [] } = opts;

  return [
    // Create browser session
    {
      name: "browser_create_session",
      description:
        "Create a new browser session for web automation. Returns a session ID that can be used with other browser tools.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Initial URL to navigate to (optional)",
          },
        },
      },
      execute: async (input: { url?: string }): Promise<McpToolResult> => {
        try {
          const client = getKernelClient(apiKey);

          // Create browser session
          const response = await client.browsers.createByID({
            timeout_sec: 300,
          });

          const sessionId = response.id;

          // Store session
          browserSessions.set(agentId, { sessionId, client });
          consoleLogs.set(agentId, []);
          networkLogs.set(agentId, []);

          // Navigate to initial URL if provided
          let navigationText = "";
          if (input.url) {
            await client.browsers.playwright.execute(sessionId, {
              code: `await page.goto('${input.url}');`,
              timeout_sec: 60,
            });
            navigationText = ` and navigated to ${input.url}`;
          }

          // If sandbox URLs provided, include in response
          let sandboxUrlsText = "";
          if (sandboxUrls.length > 0) {
            sandboxUrlsText = `\n\nAvailable sandbox URLs:\n${sandboxUrls
              .map((su) => `- Port ${su.port}: ${su.url}`)
              .join("\n")}`;
          }

          return {
            content: [
              {
                type: "text",
                text: `Browser session created successfully${navigationText}. Session ID: ${sessionId}${sandboxUrlsText}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error creating browser session: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Take screenshot
    {
      name: "browser_screenshot",
      description:
        "Capture a screenshot of the current browser page. The screenshot will be returned as an image that you can see and analyze.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      execute: async (_input: Record<string, never>): Promise<McpToolResult> => {
        try {
          const session = browserSessions.get(agentId);
          if (!session) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: No browser session found. Call browser_create_session first.",
                },
              ],
              isError: true,
            };
          }

          const { sessionId, client } = session;

          const result = await client.browsers.playwright.execute(sessionId, {
            code: `
              const screenshot = await page.screenshot({
                type: 'png',
                fullPage: true,
              });
              return screenshot.toString('base64');
            `,
            timeout_sec: 60,
          });

          const base64 = result.result as string;

          return {
            content: [
              {
                type: "text",
                text: "Screenshot captured successfully.",
              },
              {
                type: "image",
                data: base64,
                mimeType: "image/png",
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error capturing screenshot: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Navigate to URL
    {
      name: "browser_navigate",
      description: "Navigate the browser to a specific URL",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to navigate to",
          },
        },
        required: ["url"],
      },
      execute: async (input: { url: string }): Promise<McpToolResult> => {
        try {
          const session = browserSessions.get(agentId);
          if (!session) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: No browser session found. Call browser_create_session first.",
                },
              ],
              isError: true,
            };
          }

          const { sessionId, client } = session;
          const { url } = input;

          await client.browsers.playwright.execute(sessionId, {
            code: `await page.goto('${url}');`,
            timeout_sec: 60,
          });

          return {
            content: [
              {
                type: "text",
                text: `Successfully navigated to ${url}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error navigating: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Click element
    {
      name: "browser_click",
      description: "Click an element on the page using a CSS selector",
      inputSchema: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "CSS selector of the element to click",
          },
        },
        required: ["selector"],
      },
      execute: async (input: { selector: string }): Promise<McpToolResult> => {
        try {
          const session = browserSessions.get(agentId);
          if (!session) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: No browser session found. Call browser_create_session first.",
                },
              ],
              isError: true,
            };
          }

          const { sessionId, client } = session;
          const { selector } = input;

          await client.browsers.playwright.execute(sessionId, {
            code: `await page.click('${selector}');`,
            timeout_sec: 30,
          });

          return {
            content: [
              {
                type: "text",
                text: `Successfully clicked element: ${selector}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error clicking element: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Type text
    {
      name: "browser_type",
      description: "Type text into an input field using a CSS selector",
      inputSchema: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "CSS selector of the input element",
          },
          text: {
            type: "string",
            description: "Text to type",
          },
        },
        required: ["selector", "text"],
      },
      execute: async (input: { selector: string; text: string }): Promise<McpToolResult> => {
        try {
          const session = browserSessions.get(agentId);
          if (!session) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: No browser session found. Call browser_create_session first.",
                },
              ],
              isError: true,
            };
          }

          const { sessionId, client } = session;
          const { selector, text } = input;

          // Escape single quotes in text
          const escapedText = text.replace(/'/g, "\\'");

          await client.browsers.playwright.execute(sessionId, {
            code: `await page.fill('${selector}', '${escapedText}');`,
            timeout_sec: 30,
          });

          return {
            content: [
              {
                type: "text",
                text: `Successfully typed text into ${selector}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error typing text: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Execute JavaScript
    {
      name: "browser_execute",
      description: "Execute custom JavaScript code in the browser context",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "JavaScript code to execute (has access to 'page' object)",
          },
        },
        required: ["code"],
      },
      execute: async (input: { code: string }): Promise<McpToolResult> => {
        try {
          const session = browserSessions.get(agentId);
          if (!session) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: No browser session found. Call browser_create_session first.",
                },
              ],
              isError: true,
            };
          }

          const { sessionId, client } = session;
          const { code } = input;

          const result = await client.browsers.playwright.execute(sessionId, {
            code,
            timeout_sec: 60,
          });

          return {
            content: [
              {
                type: "text",
                text: `Execution result: ${JSON.stringify(result.result, null, 2)}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error executing code: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Get page content
    {
      name: "browser_get_page_content",
      description: "Get the HTML content of the current page",
      inputSchema: {
        type: "object",
        properties: {},
      },
      execute: async (_input: Record<string, never>): Promise<McpToolResult> => {
        try {
          const session = browserSessions.get(agentId);
          if (!session) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: No browser session found. Call browser_create_session first.",
                },
              ],
              isError: true,
            };
          }

          const { sessionId, client } = session;

          const result = await client.browsers.playwright.execute(sessionId, {
            code: "return await page.content();",
            timeout_sec: 30,
          });

          const content = result.result as string;

          return {
            content: [
              {
                type: "text",
                text: content,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error getting page content: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },
  ];
}

/**
 * Cleanup browser session for an agent
 */
export async function cleanupBrowserSession(agentId: string): Promise<void> {
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
