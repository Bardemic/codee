import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import type { Sandbox } from '@vercel/sandbox';
import { BrowserManager } from './browserManager';
import { SnapshotGenerator } from './snapshotGenerator';

/**
 * Build browser automation tools for AI agents
 * Follows agent-browser approach with element references for AI-friendly interaction
 */
export function buildBrowserTools(sandbox: Sandbox) {
  const browserManager = new BrowserManager();

  // Cleanup browser sessions on process exit
  process.on('beforeExit', async () => {
    await browserManager.closeAll();
  });

  return {
    browser_navigate: tool({
      description:
        'Navigate to a URL in the browser. This opens a headless browser session and loads the specified page. Use this as the first step before taking snapshots or interacting with elements.',
      inputSchema: zodSchema(
        z.object({
          url: z.string().url().describe('The URL to navigate to (must include http:// or https://)'),
          sessionId: z
            .string()
            .optional()
            .describe('Optional session ID for managing multiple browser instances'),
          waitUntil: z
            .enum(['load', 'domcontentloaded', 'networkidle'])
            .default('load')
            .describe('When to consider navigation complete'),
        })
      ),
      execute: async ({ url, sessionId, waitUntil }) => {
        try {
          const page = await browserManager.getOrCreateSession(sessionId);
          await page.goto(url, { waitUntil });

          const title = await page.title();

          return {
            success: true,
            url: page.url(),
            title,
            message: `Navigated to ${title} (${page.url()})`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    }),

    browser_snapshot: tool({
      description:
        'Get a snapshot of the current page showing interactive elements with references (@e1, @e2, etc). Use these references in other browser commands to interact with elements. Returns an accessibility tree optimized for understanding page structure.',
      inputSchema: zodSchema(
        z.object({
          sessionId: z
            .string()
            .optional()
            .describe('Optional session ID'),
          interactiveOnly: z
            .boolean()
            .default(true)
            .describe('Show only interactive elements (buttons, links, inputs)'),
          compact: z
            .boolean()
            .default(true)
            .describe('Remove empty elements for cleaner output'),
          maxDepth: z
            .number()
            .default(10)
            .describe('Maximum depth of element tree to traverse'),
          selector: z
            .string()
            .optional()
            .describe('CSS selector to scope snapshot to specific region'),
        })
      ),
      execute: async ({ sessionId, interactiveOnly, compact, maxDepth, selector }) => {
        try {
          const page = browserManager.getSession(sessionId);
          const elementTracker = browserManager.getElementTracker(sessionId);
          const generator = new SnapshotGenerator(elementTracker);

          const snapshot = await generator.generateSnapshot(page, {
            interactiveOnly,
            compact,
            maxDepth,
            selector,
          });

          const treeText = generator.formatTree(snapshot.tree);

          return {
            success: true,
            url: snapshot.url,
            title: snapshot.title,
            elementCount: snapshot.elementCount,
            snapshot: `Page: ${snapshot.title} (${snapshot.url})\n${treeText}`,
            tree: snapshot.tree,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    }),

    browser_click: tool({
      description:
        'Click an element by its reference (e.g., @e5). Get element references from browser_snapshot first.',
      inputSchema: zodSchema(
        z.object({
          elementRef: z
            .string()
            .regex(/^@?e\d+$/)
            .describe('Element reference from snapshot (e.g., @e5 or e5)'),
          sessionId: z.string().optional().describe('Optional session ID'),
          waitForNavigation: z
            .boolean()
            .default(false)
            .describe('Wait for page navigation after click'),
        })
      ),
      execute: async ({ elementRef, sessionId, waitForNavigation }) => {
        try {
          const page = browserManager.getSession(sessionId);
          const elementTracker = browserManager.getElementTracker(sessionId);

          const element = elementTracker.getElement(elementRef);

          if (waitForNavigation) {
            await Promise.all([
              page.waitForLoadState('load'),
              element.click(),
            ]);
          } else {
            await element.click();
          }

          return {
            success: true,
            ref: elementRef,
            message: `Clicked element ${elementRef}`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    }),

    browser_type: tool({
      description:
        'Type text into an input element by its reference. Get element references from browser_snapshot first.',
      inputSchema: zodSchema(
        z.object({
          elementRef: z
            .string()
            .regex(/^@?e\d+$/)
            .describe('Element reference from snapshot (e.g., @e5)'),
          text: z.string().describe('Text to type into the element'),
          sessionId: z.string().optional().describe('Optional session ID'),
          clear: z
            .boolean()
            .default(true)
            .describe('Clear existing text before typing'),
        })
      ),
      execute: async ({ elementRef, text, sessionId, clear }) => {
        try {
          const elementTracker = browserManager.getElementTracker(sessionId);
          const element = elementTracker.getElement(elementRef);

          if (clear) {
            await element.fill(text);
          } else {
            await element.type(text);
          }

          return {
            success: true,
            ref: elementRef,
            text,
            message: `Typed "${text}" into ${elementRef}`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    }),

    browser_screenshot: tool({
      description:
        'Take a screenshot of the current page. Returns base64-encoded PNG image.',
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().optional().describe('Optional session ID'),
          fullPage: z
            .boolean()
            .default(false)
            .describe('Capture full scrollable page instead of just viewport'),
        })
      ),
      execute: async ({ sessionId, fullPage }) => {
        try {
          const page = browserManager.getSession(sessionId);
          const screenshot = await page.screenshot({
            fullPage,
            type: 'png',
          });

          const base64 = screenshot.toString('base64');
          const viewport = page.viewportSize();

          return {
            success: true,
            screenshot: base64,
            width: viewport?.width || 0,
            height: viewport?.height || 0,
            message: `Screenshot captured (${viewport?.width}x${viewport?.height})`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    }),

    browser_get_text: tool({
      description:
        'Extract text content from an element or the entire page. If elementRef is provided, gets text from that element only.',
      inputSchema: zodSchema(
        z.object({
          elementRef: z
            .string()
            .regex(/^@?e\d+$/)
            .optional()
            .describe('Optional element reference to get text from'),
          sessionId: z.string().optional().describe('Optional session ID'),
        })
      ),
      execute: async ({ elementRef, sessionId }) => {
        try {
          const page = browserManager.getSession(sessionId);

          let text: string;

          if (elementRef) {
            const elementTracker = browserManager.getElementTracker(sessionId);
            const element = elementTracker.getElement(elementRef);
            text = (await element.textContent()) || '';
          } else {
            text = await page.textContent('body') || '';
          }

          return {
            success: true,
            text: text.trim(),
            ref: elementRef,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    }),

    browser_go_back: tool({
      description: 'Navigate back to the previous page in browser history.',
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().optional().describe('Optional session ID'),
        })
      ),
      execute: async ({ sessionId }) => {
        try {
          const page = browserManager.getSession(sessionId);
          await page.goBack();

          return {
            success: true,
            url: page.url(),
            message: `Navigated back to ${page.url()}`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    }),

    browser_wait_for: tool({
      description:
        'Wait for a specific condition (selector to appear, navigation, timeout).',
      inputSchema: zodSchema(
        z.object({
          type: z
            .enum(['selector', 'navigation', 'timeout'])
            .describe('Type of wait condition'),
          value: z
            .string()
            .describe('CSS selector (for selector type) or milliseconds (for timeout type)'),
          sessionId: z.string().optional().describe('Optional session ID'),
        })
      ),
      execute: async ({ type, value, sessionId }) => {
        try {
          const page = browserManager.getSession(sessionId);

          if (type === 'selector') {
            await page.waitForSelector(value);
            return {
              success: true,
              message: `Selector "${value}" appeared`,
            };
          } else if (type === 'navigation') {
            await page.waitForLoadState('load');
            return {
              success: true,
              message: 'Navigation completed',
            };
          } else if (type === 'timeout') {
            const ms = parseInt(value, 10);
            await page.waitForTimeout(ms);
            return {
              success: true,
              message: `Waited ${ms}ms`,
            };
          }

          return { success: false, error: 'Invalid wait type' };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    }),

    browser_close: tool({
      description:
        'Close a browser session and cleanup resources. Call this when done with browser automation.',
      inputSchema: zodSchema(
        z.object({
          sessionId: z
            .string()
            .optional()
            .describe('Optional session ID to close. If not provided, closes default session.'),
        })
      ),
      execute: async ({ sessionId }) => {
        try {
          await browserManager.closeSession(sessionId);
          return {
            success: true,
            message: `Browser session closed`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    }),

    browser_fill_form: tool({
      description:
        'Fill multiple form fields at once. Provide a mapping of element references to values.',
      inputSchema: zodSchema(
        z.object({
          fields: z
            .record(z.string())
            .describe('Object mapping element references to values (e.g., {"@e5": "john@example.com", "@e6": "password"})'),
          sessionId: z.string().optional().describe('Optional session ID'),
        })
      ),
      execute: async ({ fields, sessionId }) => {
        try {
          const elementTracker = browserManager.getElementTracker(sessionId);
          const results: string[] = [];

          for (const [ref, value] of Object.entries(fields)) {
            const element = elementTracker.getElement(ref);
            await element.fill(value);
            results.push(`${ref}: "${value}"`);
          }

          return {
            success: true,
            filled: results,
            message: `Filled ${results.length} fields`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    }),
  };
}
