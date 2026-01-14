import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import type { BrowserSession } from './types';
import { ElementTracker } from './elementTracker';

/**
 * Manages browser instances and sessions
 * Uses @sparticuz/chromium for serverless compatibility
 */
export class BrowserManager {
  private sessions: Map<string, BrowserSession> = new Map();
  private elementTrackers: Map<string, ElementTracker> = new Map();
  private defaultSessionId = 'default';
  private chromiumPath: string | null = null;

  /**
   * Get the Chromium executable path for serverless environments
   */
  private async getChromiumPath(): Promise<string> {
    if (this.chromiumPath) {
      return this.chromiumPath;
    }

    try {
      // Try to use @sparticuz/chromium for serverless
      const chromiumPackage = await import('@sparticuz/chromium');
      this.chromiumPath = await chromiumPackage.default.executablePath();
      console.log('Using @sparticuz/chromium at:', this.chromiumPath);
      return this.chromiumPath;
    } catch (error) {
      // Fallback to system chromium
      console.log('Fallback to system chromium');
      return ''; // Let playwright use its bundled chromium
    }
  }

  /**
   * Get Chromium args for serverless environments
   */
  private async getChromiumArgs(): Promise<string[]> {
    try {
      const chromiumPackage = await import('@sparticuz/chromium');
      return chromiumPackage.default.args;
    } catch {
      return [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ];
    }
  }

  /**
   * Launch a new browser instance
   */
  private async launchBrowser(): Promise<Browser> {
    const executablePath = await this.getChromiumPath();
    const args = await this.getChromiumArgs();

    const browser = await chromium.launch({
      executablePath: executablePath || undefined,
      args,
      headless: true,
    });

    return browser;
  }

  /**
   * Get or create a browser session
   */
  async getOrCreateSession(sessionId?: string): Promise<Page> {
    const id = sessionId || this.defaultSessionId;

    let session = this.sessions.get(id);

    if (!session) {
      const browser = await this.launchBrowser();
      const page = await browser.newPage();

      session = {
        id,
        browser,
        page,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      this.sessions.set(id, session);
      this.elementTrackers.set(id, new ElementTracker());

      console.log(`Created browser session: ${id}`);
    }

    session.lastUsedAt = new Date();
    return session.page;
  }

  /**
   * Get an existing session
   */
  getSession(sessionId?: string): Page {
    const id = sessionId || this.defaultSessionId;
    const session = this.sessions.get(id);

    if (!session) {
      throw new Error(`Browser session '${id}' not found. Call browser_navigate first to create a session.`);
    }

    session.lastUsedAt = new Date();
    return session.page;
  }

  /**
   * Get element tracker for a session
   */
  getElementTracker(sessionId?: string): ElementTracker {
    const id = sessionId || this.defaultSessionId;
    let tracker = this.elementTrackers.get(id);

    if (!tracker) {
      tracker = new ElementTracker();
      this.elementTrackers.set(id, tracker);
    }

    return tracker;
  }

  /**
   * Close a specific session
   */
  async closeSession(sessionId?: string): Promise<void> {
    const id = sessionId || this.defaultSessionId;
    const session = this.sessions.get(id);

    if (session) {
      await session.browser.close();
      this.sessions.delete(id);
      this.elementTrackers.delete(id);
      console.log(`Closed browser session: ${id}`);
    }
  }

  /**
   * Close all sessions
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.sessions.values()).map(session =>
      session.browser.close()
    );

    await Promise.all(closePromises);
    this.sessions.clear();
    this.elementTrackers.clear();
    console.log('Closed all browser sessions');
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Clean up old inactive sessions (older than maxAge milliseconds)
   */
  async cleanupInactiveSessions(maxAge: number = 5 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const sessionsToClose: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      const age = now - session.lastUsedAt.getTime();
      if (age > maxAge) {
        sessionsToClose.push(id);
      }
    }

    for (const id of sessionsToClose) {
      await this.closeSession(id);
      console.log(`Cleaned up inactive session: ${id}`);
    }
  }
}
