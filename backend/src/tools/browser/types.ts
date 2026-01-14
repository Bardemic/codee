import type { Page, ElementHandle, Browser } from 'playwright-core';

export interface BrowserSession {
  id: string;
  browser: Browser;
  page: Page;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface ElementReference {
  ref: string;
  element: ElementHandle;
  selector?: string;
  role?: string;
  text?: string;
}

export interface SnapshotOptions {
  interactiveOnly?: boolean;
  compact?: boolean;
  maxDepth?: number;
  selector?: string;
}

export interface SnapshotNode {
  ref?: string;
  role?: string;
  name?: string;
  tag?: string;
  text?: string;
  value?: string;
  placeholder?: string;
  href?: string;
  type?: string;
  clickable?: boolean;
  children?: SnapshotNode[];
}

export interface SnapshotResult {
  url: string;
  title: string;
  tree: SnapshotNode;
  elementCount: number;
}

export interface NavigateResult {
  success: boolean;
  url: string;
  title: string;
}

export interface ClickResult {
  success: boolean;
  ref: string;
}

export interface TypeResult {
  success: boolean;
  ref: string;
  text: string;
}

export interface ScreenshotResult {
  success: boolean;
  screenshot: string; // base64 encoded
  width: number;
  height: number;
}

export interface GetTextResult {
  text: string;
  ref?: string;
}
