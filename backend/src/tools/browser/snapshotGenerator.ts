import type { Page, ElementHandle } from 'playwright-core';
import type { SnapshotOptions, SnapshotNode, SnapshotResult } from './types';
import type { ElementTracker } from './elementTracker';

/**
 * Generate accessibility tree snapshots optimized for AI consumption
 * Following agent-browser's approach for minimal context usage
 */
export class SnapshotGenerator {
  constructor(private elementTracker: ElementTracker) {}

  /**
   * Generate a snapshot of the page
   */
  async generateSnapshot(
    page: Page,
    options: SnapshotOptions = {}
  ): Promise<SnapshotResult> {
    const {
      interactiveOnly = true,
      compact = true,
      maxDepth = 10,
      selector,
    } = options;

    // Clear previous element tracking for fresh snapshot
    this.elementTracker.clear();

    // Get the root element (or scoped element if selector provided)
    const rootElement = selector
      ? await page.$(selector)
      : await page.$('body');

    if (!rootElement) {
      throw new Error(selector ? `Selector "${selector}" not found` : 'Body element not found');
    }

    // Build the tree
    const tree = await this.buildTree(rootElement, 0, maxDepth, interactiveOnly, compact);

    return {
      url: page.url(),
      title: await page.title(),
      tree,
      elementCount: this.elementTracker.getCount(),
    };
  }

  /**
   * Recursively build the accessibility tree
   */
  private async buildTree(
    element: ElementHandle,
    depth: number,
    maxDepth: number,
    interactiveOnly: boolean,
    compact: boolean
  ): Promise<SnapshotNode> {
    if (depth >= maxDepth) {
      return { text: '...' };
    }

    // Get element properties
    const properties = await this.getElementProperties(element);
    const isInteractive = this.isInteractiveElement(properties);

    // Skip non-interactive elements if filter is enabled
    if (interactiveOnly && !isInteractive && depth > 0) {
      return { text: '' };
    }

    // Build node
    const node: SnapshotNode = {};

    // Track interactive elements and assign reference
    if (isInteractive) {
      node.ref = this.elementTracker.trackElement(element, {
        role: properties.role,
        text: properties.text,
      });
    }

    // Add element metadata
    if (properties.role) node.role = properties.role;
    if (properties.tag) node.tag = properties.tag;
    if (properties.name) node.name = properties.name;
    if (properties.text && properties.text.trim()) {
      node.text = properties.text.trim().substring(0, 100); // Limit text length
    }
    if (properties.value) node.value = properties.value;
    if (properties.placeholder) node.placeholder = properties.placeholder;
    if (properties.href) node.href = properties.href;
    if (properties.type) node.type = properties.type;
    if (isInteractive) node.clickable = true;

    // Get children
    const children = await element.$$(':scope > *');
    const childNodes: SnapshotNode[] = [];

    for (const child of children) {
      const childNode = await this.buildTree(
        child,
        depth + 1,
        maxDepth,
        interactiveOnly,
        compact
      );

      // Skip empty nodes in compact mode
      if (compact && this.isEmptyNode(childNode)) {
        continue;
      }

      childNodes.push(childNode);
    }

    if (childNodes.length > 0) {
      node.children = childNodes;
    }

    return node;
  }

  /**
   * Get relevant properties from an element
   */
  private async getElementProperties(element: ElementHandle): Promise<any> {
    return await element.evaluate((el) => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || '';
      const ariaLabel = el.getAttribute('aria-label') || '';
      const name = (el as HTMLInputElement).name || '';
      const id = el.id || '';
      const type = (el as HTMLInputElement).type || '';
      const value = (el as HTMLInputElement).value || '';
      const placeholder = (el as HTMLInputElement).placeholder || '';
      const href = (el as HTMLAnchorElement).href || '';

      // Get text content (first 200 chars)
      let text = '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        text = ariaLabel || placeholder || name;
      } else if (tag === 'button' || tag === 'a') {
        text = el.textContent?.trim().substring(0, 200) || ariaLabel;
      } else {
        // Get only direct text content, not from children
        const directText = Array.from(el.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent?.trim())
          .filter(Boolean)
          .join(' ');
        text = directText || ariaLabel;
      }

      return {
        tag,
        role: role || this.getImplicitRole(el),
        name: ariaLabel || name,
        text,
        value,
        placeholder,
        href,
        type,
      };

      function getImplicitRole(element: Element): string {
        const tagName = element.tagName.toLowerCase();
        const roleMap: Record<string, string> = {
          'a': 'link',
          'button': 'button',
          'input': 'textbox',
          'textarea': 'textbox',
          'select': 'combobox',
          'img': 'img',
          'nav': 'navigation',
          'main': 'main',
          'header': 'banner',
          'footer': 'contentinfo',
          'aside': 'complementary',
          'section': 'region',
          'article': 'article',
          'form': 'form',
          'table': 'table',
          'ul': 'list',
          'ol': 'list',
          'li': 'listitem',
          'h1': 'heading',
          'h2': 'heading',
          'h3': 'heading',
          'h4': 'heading',
          'h5': 'heading',
          'h6': 'heading',
        };
        return roleMap[tagName] || '';
      }
    });
  }

  /**
   * Check if an element is interactive
   */
  private isInteractiveElement(properties: any): boolean {
    const interactiveTags = ['a', 'button', 'input', 'textarea', 'select'];
    const interactiveRoles = [
      'button',
      'link',
      'textbox',
      'combobox',
      'checkbox',
      'radio',
      'tab',
      'menuitem',
    ];

    return (
      interactiveTags.includes(properties.tag) ||
      interactiveRoles.includes(properties.role) ||
      properties.href !== ''
    );
  }

  /**
   * Check if a node is empty (for compact mode)
   */
  private isEmptyNode(node: SnapshotNode): boolean {
    return (
      !node.ref &&
      !node.text &&
      !node.name &&
      !node.value &&
      (!node.children || node.children.length === 0)
    );
  }

  /**
   * Format snapshot tree as readable text
   */
  formatTree(node: SnapshotNode, indent: number = 0): string {
    const lines: string[] = [];
    const prefix = '  '.repeat(indent);

    // Skip completely empty nodes
    if (!node.text && !node.ref && !node.role && !node.tag && !node.children) {
      return '';
    }

    // Build node description
    const parts: string[] = [];

    if (node.ref) parts.push(node.ref);
    if (node.role) parts.push(`[role="${node.role}"]`);
    if (node.tag && !node.role) parts.push(node.tag);
    if (node.name) parts.push(`"${node.name}"`);
    if (node.text && !node.name) parts.push(`"${node.text}"`);

    // Add attributes
    const attrs: string[] = [];
    if (node.href) attrs.push(`href="${node.href}"`);
    if (node.type) attrs.push(`type="${node.type}"`);
    if (node.value) attrs.push(`value="${node.value}"`);
    if (node.placeholder) attrs.push(`placeholder="${node.placeholder}"`);
    if (node.clickable) attrs.push('clickable');

    if (attrs.length > 0) {
      parts.push(`[${attrs.join(', ')}]`);
    }

    if (parts.length > 0) {
      lines.push(`${prefix}└─ ${parts.join(' ')}`);
    }

    // Process children
    if (node.children) {
      for (const child of node.children) {
        const childText = this.formatTree(child, indent + 1);
        if (childText) {
          lines.push(childText);
        }
      }
    }

    return lines.join('\n');
  }
}
