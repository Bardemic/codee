# Browser Automation Tools

This module provides browser automation capabilities for AI agents using Playwright and @sparticuz/chromium.

## Overview

The browser automation tools allow agents to:
- Navigate to websites
- Interact with web elements (click, type, fill forms)
- Extract content and take screenshots
- Understand page structure through accessibility trees

## Architecture

### Key Components

1. **BrowserManager** (`browserManager.ts`)
   - Manages browser lifecycle and sessions
   - Uses @sparticuz/chromium for serverless compatibility (~50MB)
   - Supports multiple concurrent browser sessions
   - Automatic cleanup of inactive sessions

2. **ElementTracker** (`elementTracker.ts`)
   - Tracks elements with references (@e1, @e2, etc.)
   - Enables AI-friendly element interaction
   - Manages element lifecycle per session

3. **SnapshotGenerator** (`snapshotGenerator.ts`)
   - Generates accessibility tree snapshots
   - Optimized for minimal context usage (following agent-browser approach)
   - Filters interactive elements for cleaner output
   - Produces human-readable tree format

## Available Tools

### Core Navigation

#### `browser_navigate`
Navigate to a URL and load the page.

```typescript
{
  url: "https://example.com",
  sessionId?: "optional-session-id",
  waitUntil: "load" | "domcontentloaded" | "networkidle"
}
```

#### `browser_snapshot`
Get page structure with element references for interaction.

```typescript
{
  sessionId?: string,
  interactiveOnly: boolean,  // Default: true
  compact: boolean,          // Default: true
  maxDepth: number,          // Default: 10
  selector?: string          // Optional CSS selector to scope snapshot
}
```

**Returns:** Accessibility tree with element references:
```
Page: Example Site (https://example.com)
└─ nav [role="navigation"]
   ├─ @e1 link "Home" [href="/"]
   ├─ @e2 link "Products" [href="/products"]
   └─ @e3 button "Sign Up" [clickable]
```

### Element Interaction

#### `browser_click`
Click an element by its reference.

```typescript
{
  elementRef: "@e5",         // From snapshot
  sessionId?: string,
  waitForNavigation: boolean // Default: false
}
```

#### `browser_type`
Type text into an input element.

```typescript
{
  elementRef: "@e5",
  text: "user input",
  sessionId?: string,
  clear: boolean            // Default: true
}
```

#### `browser_fill_form`
Fill multiple form fields at once.

```typescript
{
  fields: {
    "@e5": "john@example.com",
    "@e6": "password123"
  },
  sessionId?: string
}
```

### Content Extraction

#### `browser_get_text`
Extract text content from page or specific element.

```typescript
{
  elementRef?: "@e5",       // Optional, gets all page text if omitted
  sessionId?: string
}
```

#### `browser_screenshot`
Capture page screenshot.

```typescript
{
  sessionId?: string,
  fullPage: boolean         // Default: false
}
```

**Returns:** Base64-encoded PNG image

### Utility

#### `browser_wait_for`
Wait for conditions.

```typescript
{
  type: "selector" | "navigation" | "timeout",
  value: string,            // CSS selector or milliseconds
  sessionId?: string
}
```

#### `browser_go_back`
Navigate to previous page.

```typescript
{
  sessionId?: string
}
```

#### `browser_close`
Close browser session and cleanup resources.

```typescript
{
  sessionId?: string
}
```

## Usage Example

Here's a typical agent workflow:

```typescript
// 1. Navigate to website
await browser_navigate({ url: "https://example.com/login" })

// 2. Take snapshot to see interactive elements
const snapshot = await browser_snapshot({ interactiveOnly: true })
// Returns:
// └─ form
//    ├─ @e1 input "Email" [type="email"]
//    ├─ @e2 input "Password" [type="password"]
//    └─ @e3 button "Sign In" [clickable]

// 3. Fill form
await browser_fill_form({
  fields: {
    "@e1": "user@example.com",
    "@e2": "password123"
  }
})

// 4. Submit
await browser_click({ elementRef: "@e3", waitForNavigation: true })

// 5. Take screenshot of result
const screenshot = await browser_screenshot({ fullPage: true })

// 6. Cleanup
await browser_close()
```

## Session Management

Sessions allow multiple independent browser instances:

```typescript
// Create multiple sessions
await browser_navigate({ url: "https://site1.com", sessionId: "session1" })
await browser_navigate({ url: "https://site2.com", sessionId: "session2" })

// Interact with specific sessions
await browser_click({ elementRef: "@e1", sessionId: "session1" })
await browser_click({ elementRef: "@e5", sessionId: "session2" })

// Close specific sessions
await browser_close({ sessionId: "session1" })
```

## Performance Considerations

### Serverless Optimization

- Uses @sparticuz/chromium (~50MB) instead of full Chromium (~684MB)
- First run downloads to `/tmp/chromium`
- Warm starts reuse cached binary
- Automatic session cleanup after 5 minutes of inactivity

### Memory Management

- Browser runs in headless mode
- Each session maintains separate context
- Sessions automatically cleaned up on process exit
- Consider setting memory limits for sandbox environments

### Network Efficiency

- `waitUntil` parameter controls when navigation completes
  - `load`: Wait for full page load (default)
  - `domcontentloaded`: Wait for DOM only (faster)
  - `networkidle`: Wait for network to be idle

## Security Considerations

1. **URL Validation**: Agents should validate URLs before navigation
2. **Resource Limits**: Set timeouts to prevent hanging operations
3. **Sandbox Isolation**: Browsers run within Vercel Sandbox for isolation
4. **Data Privacy**: Screenshots and cookies are not persisted by default
5. **Rate Limiting**: Consider implementing rate limits per agent/workspace

## Troubleshooting

### Browser fails to launch
- Ensure @sparticuz/chromium is properly installed
- Check available memory in sandbox environment
- Verify /tmp directory is writable

### Elements not found
- Take a new snapshot before interacting with elements
- Element references are session-specific
- Page navigation clears element references (take new snapshot)

### Slow performance
- Use `interactiveOnly: true` in snapshots to reduce data
- Set `waitUntil: "domcontentloaded"` for faster navigation
- Close unused sessions to free resources

## Future Enhancements

Potential improvements:
- Element highlighting in screenshots
- Recording interaction sessions
- Cookie/localStorage persistence
- Network request interception
- Multi-tab support
- Mobile device emulation
