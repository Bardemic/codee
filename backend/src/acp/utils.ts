/**
 * Utility functions for ACP integration
 */

import type { McpToolContent } from "./types";

/**
 * Extract text content from MCP tool result
 */
export function extractTextContent(content: McpToolContent[]): string {
  return content
    .filter((c) => c.type === "text")
    .map((c) => (c as any).text)
    .join("\n");
}

/**
 * Extract images from MCP tool result
 */
export function extractImages(content: McpToolContent[]): string[] {
  return content
    .filter((c) => c.type === "image")
    .map((c) => (c as any).data);
}

/**
 * Format error message from various error types
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Check if a tool slug matches a pattern
 */
export function matchesToolSlug(slug: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return slug.startsWith(prefix);
  }
  return slug === pattern;
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
