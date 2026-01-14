import type { ElementHandle } from 'playwright-core';
import type { ElementReference } from './types';

/**
 * Tracks elements with references (@e1, @e2, etc.) for AI-friendly interaction
 * Following agent-browser's approach for element reference system
 */
export class ElementTracker {
  private elements: Map<string, ElementReference> = new Map();
  private counter = 0;

  /**
   * Track an element and return its reference ID
   */
  trackElement(
    element: ElementHandle,
    metadata?: {
      selector?: string;
      role?: string;
      text?: string;
    }
  ): string {
    const ref = `@e${++this.counter}`;
    this.elements.set(ref, {
      ref,
      element,
      ...metadata,
    });
    return ref;
  }

  /**
   * Get an element by its reference ID
   */
  getElement(ref: string): ElementHandle {
    const normalized = ref.startsWith('@') ? ref : `@${ref}`;
    const elementRef = this.elements.get(normalized);
    if (!elementRef) {
      throw new Error(`Element ${normalized} not found. Available: ${Array.from(this.elements.keys()).join(', ')}`);
    }
    return elementRef.element;
  }

  /**
   * Get element reference metadata
   */
  getElementMetadata(ref: string): ElementReference | undefined {
    const normalized = ref.startsWith('@') ? ref : `@${ref}`;
    return this.elements.get(normalized);
  }

  /**
   * Check if a reference exists
   */
  hasElement(ref: string): boolean {
    const normalized = ref.startsWith('@') ? ref : `@${ref}`;
    return this.elements.has(normalized);
  }

  /**
   * Clear all tracked elements
   */
  clear(): void {
    this.elements.clear();
    this.counter = 0;
  }

  /**
   * Get all tracked element references
   */
  getAllRefs(): string[] {
    return Array.from(this.elements.keys());
  }

  /**
   * Get count of tracked elements
   */
  getCount(): number {
    return this.elements.size;
  }
}
