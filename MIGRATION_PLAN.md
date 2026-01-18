# Migration Plan: Vercel AI SDK → ACP with Claude Code Agent

## Executive Summary

This document outlines the migration strategy from Vercel AI SDK to Agent Client Protocol (ACP) with Claude Code agent integration. The goal is to enable a pluggable agent architecture that supports multiple CLI agents while maintaining control over tool execution and visibility.

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Target Architecture](#2-target-architecture)
3. [Key Challenges & Solutions](#3-key-challenges--solutions)
4. [Migration Strategy](#4-migration-strategy)
5. [Implementation Phases](#5-implementation-phases)
6. [Technical Implementation Details](#6-technical-implementation-details)
7. [Testing Strategy](#7-testing-strategy)
8. [Rollback Plan](#8-rollback-plan)
9. [Future Extensibility](#9-future-extensibility)

---

## 1. Current Architecture Analysis

### 1.1 Current Stack
- **LLM Orchestration**: Vercel AI SDK 6.0 (`generateText`, `generateObject`)
- **Code Execution**: Vercel Sandbox (Node22 runtime, 30min timeout)
- **Workflow Engine**: Nitro Workflow (durable execution)
- **Database**: PostgreSQL + TypeORM
- **API Layer**: Express + tRPC
- **Authentication**: WorkOS (cookie-based sessions)

### 1.2 Current Tool Architecture

**Tool Categories:**
1. **Sandbox Tools** (`sandboxTools.ts`):
   - `listFiles`, `readFile`, `updateFile`, `runCommand`
   - Execute directly against Vercel Sandbox instance

2. **Dynamic Tools** (`dynamic.ts`):
   - PostHog tools (query_runner, insights, errors, documentation)
   - GitHub tools (commits)
   - Built dynamically based on workspace configuration

3. **Browser Tools** (`kernel/`):
   - OnKernel SDK integration
   - Returns images (base64) alongside text
   - Passed to AI via `toModelOutput` with image-data content blocks

4. **Orchestrator Tools** (`primaryAgent.ts`):
   - `spawn_sub_agent` - Creates new agent instances

### 1.3 Current Agent Flow

```
User Request → tRPC API
  ↓
runAgentWorkflow (Nitro)
  ↓
1. loadAgent (from DB)
2. validateAndGetToken (GitHub)
3. prepareSandbox (Vercel Sandbox)
4. createBranchIfNeeded (Git)
5. loadPreviousMessages (DB)
6. runAgentLLM:
   - Build tools: {...sandboxTools, ...dynamicTools, ...browserTools}
   - generateText({ model, tools, ... })
   - Stream reasoning to client via SSE
7. saveAgentResponse (DB: messages, tool_calls with images)
8. commitChangesIfNeeded (Git)
9. cleanupSandbox
10. markAgentComplete/Failed
```

### 1.4 Key Features to Preserve

- **Real-time updates**: SSE streaming (status, error, done, reasoning)
- **Image support**: Browser tools return base64 images
- **Tool call tracking**: Store arguments, results, images in DB
- **Cost tracking**: Token usage, microdollars, sandbox time
- **Multi-agent orchestration**: Sub-agent spawning
- **Dynamic tool loading**: Based on workspace configuration

---

## 2. Target Architecture

### 2.1 ACP Architecture Overview

**Agent Client Protocol** standardizes communication between:
- **Client**: Your backend application (Codee platform)
- **Agent**: Claude Code (via `@zed-industries/claude-code-acp`)
- **MCP Servers**: Model Context Protocol servers (tools/resources)

```
┌──────────────────────────────────────────────────────────┐
│                    Codee Backend (Client)                 │
│  ┌─────────────────────────────────────────────────────┐ │
│  │            ACP Client (SDK)                         │ │
│  │  - newSession()                                     │ │
│  │  - prompt()                                         │ │
│  │  - sessionUpdate notifications                      │ │
│  └──────────────────┬──────────────────────────────────┘ │
│                     │ ACP Protocol (JSON-RPC)            │
│                     ▼                                     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │       Claude Code Agent (ACP Server)                │ │
│  │  - @zed-industries/claude-code-acp                  │ │
│  │  - Uses @anthropic-ai/claude-agent-sdk internally   │ │
│  │  - Receives custom MCP servers from client          │ │
│  └──────────────────┬──────────────────────────────────┘ │
│                     │                                     │
│                     ▼                                     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │         Custom MCP Server (Our Tools)               │ │
│  │  - Sandbox tools (via MCP protocol)                 │ │
│  │  - Dynamic tools (PostHog, GitHub, etc.)            │ │
│  │  - Browser tools (OnKernel)                         │ │
│  │  - Orchestrator tools (spawn_sub_agent)             │ │
│  └─────────────────────────────────────────────────────┘ │
│                     │                                     │
│                     ▼                                     │
│              Vercel Sandbox                               │
│         (File operations, Git, Shell)                     │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Key Components

**1. ACP Client (Codee Backend)**
- **Package**: `@agentclientprotocol/sdk`
- **Role**: Initiates sessions, sends prompts, receives updates
- **Responsibilities**:
  - Create sessions with custom MCP servers
  - Send user messages with images
  - Receive real-time notifications (tool calls, reasoning, status)
  - Manage session lifecycle

**2. Claude Code Agent**
- **Package**: `@zed-industries/claude-code-acp`
- **Role**: ACP-compatible agent powered by Claude Agent SDK
- **Configuration**:
  - Disable built-in tools (file, bash, etc.)
  - Use only client-provided MCP servers
  - Pass through `ANTHROPIC_API_KEY` from env

**3. Custom MCP Server**
- **Package**: `@modelcontextprotocol/sdk`
- **Role**: Expose Codee's tools to Claude Code
- **Features**:
  - Sandbox operations (read/write files, run commands)
  - Dynamic tools (PostHog, GitHub integrations)
  - Browser automation (OnKernel)
  - Orchestrator capabilities (sub-agents)
  - **Critical**: Must support image returns for browser tools

---

## 3. Key Challenges & Solutions

### 3.1 Challenge: Tool Visibility & Control

**Problem**: User wants to see tool calls, inspect inputs/outputs, and maintain control over execution.

**Solution**:
- Claude Code by default uses its own built-in tools (Bash, Read, Edit, Write)
- We'll provide a custom MCP server that exposes our Vercel Sandbox tools
- Configure Claude Code to ONLY use client-provided MCP servers
- Disable or don't expose Claude Code's built-in MCP server

**Implementation**:
```typescript
// When creating ACP session
const mcpServers = [
  {
    type: "stdio" as const,
    command: "node",
    args: ["/path/to/our-mcp-server.js"],
    env: {
      SANDBOX_ID: sandboxId,
      VERCEL_TOKEN: process.env.VERCEL_TOKEN,
      // ... other env vars
    }
  }
];

await acpClient.newSession({
  cwd: "/workspace",
  mcpServers,
  _meta: {
    claudeCode: {
      options: {
        // Don't use Claude Code's built-in tools
        // Only use tools from client MCP servers
      }
    }
  }
});
```

### 3.2 Challenge: Image Support

**Problem**: Browser tools return images that must be displayed to users and passed to the model.

**Solution**:
- MCP protocol supports resources with binary data
- Tool results can include both text and image content blocks
- ACP notifications include `ToolCallContent` that supports images
- Store images in DB as we currently do

**Implementation**:
```typescript
// In MCP server tool handler
const result = await browserTool.screenshot();
return {
  content: [
    {
      type: "text",
      text: result.text
    },
    {
      type: "image",
      data: result.imageBase64,
      mimeType: "image/png"
    }
  ]
};
```

### 3.3 Challenge: Dynamic Tool Loading

**Problem**: Tools are configured per workspace (PostHog, GitHub, etc.).

**Solution**:
- Create MCP server dynamically for each agent session
- Pass workspace configuration via environment variables
- MCP server queries DB for workspace tools and builds tool list
- Register tools conditionally based on workspace config

**Implementation**:
```typescript
// Pseudo-code
class CodeeMcpServer {
  async listTools() {
    const tools = [];

    // Always include sandbox tools
    tools.push(...SANDBOX_TOOLS);

    // Load workspace tools from env/config
    const workspaceId = process.env.WORKSPACE_ID;
    const enabledTools = await getWorkspaceTools(workspaceId);

    if (enabledTools.includes('posthog/*')) {
      tools.push(...POSTHOG_TOOLS);
    }
    if (enabledTools.includes('github/commits')) {
      tools.push(...GITHUB_TOOLS);
    }
    if (hasBrowserAccess) {
      tools.push(...BROWSER_TOOLS);
    }

    return tools;
  }
}
```

### 3.4 Challenge: Multi-Agent Orchestration

**Problem**: Orchestrator agent spawns sub-agents via `spawn_sub_agent` tool.

**Solution**:
- Expose `spawn_sub_agent` as an MCP tool
- Tool implementation creates a new ACP session
- Each sub-agent gets its own MCP server instance
- Parent agent receives sub-agent updates via callbacks

**Implementation**:
```typescript
// MCP tool: spawn_sub_agent
async execute({ task, context }) {
  // Create new agent in DB
  const subAgent = await createAgent({
    workspaceId,
    parentAgentId: currentAgentId,
    task,
  });

  // Spawn new ACP session
  const sessionId = await acpClient.newSession({
    cwd: "/workspace",
    mcpServers: buildMcpServers(subAgent),
  });

  // Send initial prompt
  await acpClient.prompt({
    sessionId,
    messages: [{ role: "user", content: task }],
  });

  return {
    content: [{
      type: "text",
      text: `Sub-agent created: ${subAgent.id}`
    }]
  };
}
```

### 3.5 Challenge: Real-time Streaming

**Problem**: Current system streams reasoning steps to users via SSE.

**Solution**:
- ACP supports real-time notifications via `sessionUpdate`
- Claude Code streams tool calls, reasoning, and results
- Map ACP notifications to our existing SSE events
- Continue using SSE for frontend compatibility

**Implementation**:
```typescript
// ACP notification handler
acpClient.on('sessionUpdate', (notification) => {
  if (notification.update.sessionUpdate === 'tool_call') {
    // Stream to frontend via SSE
    sendSSE(agentId, {
      type: 'tool_call',
      tool: notification.update.toolCall,
    });

    // Save to DB
    saveToolCall({
      agentId,
      toolName: notification.update.toolCall.title,
      ...
    });
  }

  if (notification.update.sessionUpdate === 'tool_update') {
    // Update tool call in DB with results
    updateToolCall({
      toolCallId: notification.update.toolCallId,
      result: notification.update.content,
    });
  }
});
```

### 3.6 Challenge: Authentication

**Problem**: Need to pass API keys to Claude Code and MCP servers securely.

**Solution**:
- Use environment variables for sensitive keys
- Pass `ANTHROPIC_API_KEY` to Claude Code process
- Pass sandbox/integration credentials to MCP server via env
- Retrieve integration keys from DB (encrypted) at session creation

**Implementation**:
```typescript
const env = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  VERCEL_TOKEN: process.env.VERCEL_TOKEN,
  SANDBOX_ID: sandbox.id,
  WORKSPACE_ID: workspace.id,
  ORGANIZATION_ID: organization.id,
  // Integration keys (decrypted from DB)
  POSTHOG_API_KEY: await getIntegrationApiKey(orgId, 'posthog'),
  KERNEL_API_KEY: await getIntegrationApiKey(orgId, 'kernel'),
};
```

---

## 4. Migration Strategy

### 4.1 Parallel Track Approach

**Phase 1**: Build ACP infrastructure alongside existing AI SDK
- Create new `acp/` directory structure
- Implement ACP client wrapper
- Build custom MCP server
- No changes to existing workflow

**Phase 2**: Feature flag for ACP vs AI SDK
- Add `useAcp` flag to Agent/Workspace entity
- Implement `runAgentWorkflowAcp` alongside `runAgentWorkflow`
- Test with select workspaces

**Phase 3**: Gradual migration
- Migrate Claude Code provider to ACP
- Keep Vercel AI SDK for utilities (generateTitle, etc.)
- Monitor performance and reliability

**Phase 4**: Full cutover
- Default all new agents to ACP
- Deprecate AI SDK agent workflow
- Keep AI SDK for non-agent LLM tasks

### 4.2 Backwards Compatibility

**Preserve**:
- Database schema (no breaking changes)
- API contracts (tRPC routers)
- SSE event format
- Frontend expectations

**Changes**:
- Internal workflow implementation
- Tool execution mechanism
- LLM provider communication

---

## 5. Implementation Phases

### Phase 1: Foundation (Week 1)

**Goals**:
- Set up ACP infrastructure
- Create minimal MCP server
- Proof of concept

**Tasks**:
1. Install dependencies:
   ```bash
   npm install @agentclientprotocol/sdk @modelcontextprotocol/sdk @zed-industries/claude-code-acp
   ```

2. Create directory structure:
   ```
   backend/src/acp/
   ├── client.ts           # ACP client wrapper
   ├── mcp-server/
   │   ├── index.ts        # MCP server entry point
   │   ├── tools/
   │   │   ├── sandbox.ts  # Sandbox tools
   │   │   ├── dynamic.ts  # PostHog, GitHub, etc.
   │   │   ├── browser.ts  # OnKernel tools
   │   │   └── orchestrator.ts  # Sub-agent spawning
   │   └── server.ts       # MCP server implementation
   ├── notifications.ts    # ACP notification handlers
   ├── utils.ts           # Helpers
   └── types.ts           # TypeScript types
   ```

3. Implement basic MCP server:
   - Sandbox tools only (read, write, runCommand)
   - Test locally with claude-code-acp CLI

4. Implement ACP client wrapper:
   - Session management
   - Prompt sending
   - Notification handling

**Deliverable**: Working proof-of-concept that can execute a simple task via ACP

---

### Phase 2: Tool Migration (Week 2)

**Goals**:
- Migrate all existing tools to MCP
- Support images from browser tools
- Dynamic tool loading

**Tasks**:

1. **Sandbox Tools** (`acp/mcp-server/tools/sandbox.ts`):
   - Migrate: `listFiles`, `readFile`, `updateFile`, `runCommand`
   - Wrap Vercel Sandbox SDK calls
   - Return MCP-compatible responses

2. **Browser Tools** (`acp/mcp-server/tools/browser.ts`):
   - Migrate OnKernel tools
   - Support image returns via MCP content blocks
   - Test screenshot → base64 → MCP → ACP → DB → Frontend flow

3. **Dynamic Tools** (`acp/mcp-server/tools/dynamic.ts`):
   - PostHog tools (query_runner, insights, errors, docs)
   - GitHub tools
   - Load based on workspace configuration

4. **Orchestrator Tools** (`acp/mcp-server/tools/orchestrator.ts`):
   - `spawn_sub_agent` implementation
   - Create new ACP sessions for sub-agents
   - Handle sub-agent lifecycle

**Deliverable**: Complete MCP server with all current tools

---

### Phase 3: Workflow Integration (Week 3)

**Goals**:
- Integrate ACP into Nitro workflow
- Real-time streaming to frontend
- Database persistence

**Tasks**:

1. Create new workflow: `backend/src/workflows/agentAcp.ts`
   ```typescript
   'use workflow';

   export async function runAgentWorkflowAcp(agentId: string) {
     // Similar structure to runAgentWorkflow, but uses ACP

     const agent = await loadAgent(agentId);
     const token = await validateAndGetToken(agent);
     const sandbox = await prepareSandbox(agent, token);
     await createBranchIfNeeded(agent, sandbox, token);

     // NEW: ACP session creation
     const sessionId = await createAcpSession(agent, sandbox);

     // NEW: ACP prompt loop
     await runAcpPromptLoop(sessionId, agent, sandbox);

     await commitChangesIfNeeded(agent, sandbox);
     await cleanupSandbox(sandbox);
     await markAgentComplete(agent);
   }
   ```

2. Implement ACP steps:
   - `createAcpSession`: Create MCP server, spawn Claude Code, init session
   - `runAcpPromptLoop`: Send messages, handle notifications, stream to frontend
   - `handleAcpNotifications`: Map ACP events → SSE events + DB saves

3. Add feature flag:
   ```typescript
   // In Agent entity
   @Column({ type: 'boolean', default: false })
   useAcp: boolean;

   // In workflow router
   if (agent.useAcp) {
     await runAgentWorkflowAcp(agentId);
   } else {
     await runAgentWorkflow(agentId);
   }
   ```

**Deliverable**: Full ACP workflow that can be enabled per-agent

---

### Phase 4: Testing & Refinement (Week 4)

**Goals**:
- Comprehensive testing
- Performance optimization
- Bug fixes

**Tasks**:

1. **Unit Tests**:
   - MCP server tools
   - ACP client wrapper
   - Notification handlers

2. **Integration Tests**:
   - Full workflow execution
   - Multi-agent orchestration
   - Browser tool with images
   - Dynamic tool loading

3. **Performance Testing**:
   - Latency comparison (AI SDK vs ACP)
   - Memory usage
   - Concurrent sessions

4. **User Acceptance Testing**:
   - Test with real repositories
   - Validate SSE streaming
   - Check image display
   - Verify cost tracking

**Deliverable**: Production-ready ACP implementation

---

### Phase 5: Rollout (Week 5)

**Goals**:
- Gradual rollout to users
- Monitor and iterate

**Tasks**:

1. Enable for internal testing:
   - Flag specific workspaces/organizations
   - Monitor error rates, performance

2. Beta rollout:
   - Invite select users
   - Gather feedback
   - Fix issues

3. General availability:
   - Default new agents to ACP
   - Provide opt-out for existing users
   - Announce new capabilities

4. Cleanup:
   - Remove feature flags after stabilization
   - Deprecate old AI SDK workflow
   - Update documentation

**Deliverable**: Fully migrated platform

---

## 6. Technical Implementation Details

### 6.1 MCP Server Implementation

**File**: `backend/src/acp/mcp-server/server.ts`

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { buildSandboxTools } from './tools/sandbox.js';
import { buildBrowserTools } from './tools/browser.js';
import { buildDynamicTools } from './tools/dynamic.js';
import { buildOrchestratorTools } from './tools/orchestrator.js';

class CodeeMcpServer {
  private server: Server;
  private tools: Map<string, ToolHandler> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'codee-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.loadTools();
  }

  private async loadTools() {
    const sandboxId = process.env.SANDBOX_ID!;
    const workspaceId = process.env.WORKSPACE_ID!;
    const organizationId = process.env.ORGANIZATION_ID!;

    // Load sandbox instance
    const sandbox = await getSandbox(sandboxId);

    // Build tool sets
    const sandboxTools = buildSandboxTools(sandbox);
    const browserTools = await buildBrowserTools(organizationId);
    const dynamicTools = await buildDynamicTools(workspaceId, organizationId);
    const orchestratorTools = buildOrchestratorTools(workspaceId);

    // Register all tools
    for (const tool of [...sandboxTools, ...browserTools, ...dynamicTools, ...orchestratorTools]) {
      this.tools.set(tool.name, tool);
    }
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()).map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.tools.get(request.params.name);
      if (!tool) {
        throw new Error(`Tool not found: ${request.params.name}`);
      }

      const result = await tool.execute(request.params.arguments);

      return {
        content: result.content, // Array of text/image blocks
        isError: result.isError,
      };
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Codee MCP Server started');
  }
}

// Entry point
const server = new CodeeMcpServer();
server.start().catch(console.error);
```

### 6.2 Sandbox Tools Example

**File**: `backend/src/acp/mcp-server/tools/sandbox.ts`

```typescript
import { Sandbox } from '@vercel/sandbox';
import { z } from 'zod';

const ReadFileInputSchema = z.object({
  file_path: z.string().describe('Absolute path to file'),
  offset: z.number().optional().describe('Line number to start reading from'),
  limit: z.number().optional().describe('Number of lines to read'),
});

export function buildSandboxTools(sandbox: Sandbox) {
  return [
    {
      name: 'read_file',
      description: 'Read contents of a file from the repository',
      inputSchema: ReadFileInputSchema,
      execute: async (input: z.infer<typeof ReadFileInputSchema>) => {
        try {
          const content = await sandbox.readFile(input.file_path);

          // Handle offset/limit
          if (input.offset || input.limit) {
            const lines = content.split('\n');
            const start = (input.offset ?? 1) - 1;
            const end = start + (input.limit ?? lines.length);
            const selected = lines.slice(start, end);
            return {
              content: [{
                type: 'text',
                text: selected.join('\n'),
              }],
            };
          }

          return {
            content: [{
              type: 'text',
              text: content,
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error reading file: ${error.message}`,
            }],
            isError: true,
          };
        }
      },
    },

    {
      name: 'write_file',
      description: 'Write or overwrite a file in the repository',
      inputSchema: z.object({
        file_path: z.string(),
        content: z.string(),
      }),
      execute: async (input) => {
        await sandbox.writeFiles({
          [input.file_path]: input.content,
        });

        return {
          content: [{
            type: 'text',
            text: `Successfully wrote to ${input.file_path}`,
          }],
        };
      },
    },

    {
      name: 'run_command',
      description: 'Execute a shell command in the sandbox',
      inputSchema: z.object({
        command: z.string(),
        timeout: z.number().optional().default(120000),
      }),
      execute: async (input) => {
        const result = await sandbox.runCommand(input.command, {
          timeout: input.timeout,
        });

        return {
          content: [{
            type: 'text',
            text: result.stdout + result.stderr,
          }],
          isError: result.exitCode !== 0,
        };
      },
    },

    // ... other tools
  ];
}
```

### 6.3 Browser Tools with Images

**File**: `backend/src/acp/mcp-server/tools/browser.ts`

```typescript
import OnKernel from '@onkernel/sdk';
import { z } from 'zod';

export async function buildBrowserTools(organizationId: string) {
  const apiKey = await getIntegrationApiKey(organizationId, 'kernel');
  if (!apiKey) return [];

  const kernel = new OnKernel({ apiKey });

  return [
    {
      name: 'browser_screenshot',
      description: 'Capture a screenshot of the current browser page',
      inputSchema: z.object({
        session_id: z.string(),
      }),
      execute: async (input) => {
        const screenshot = await kernel.screenshot(input.session_id);

        // Return both text and image content
        return {
          content: [
            {
              type: 'text',
              text: 'Screenshot captured successfully',
            },
            {
              type: 'image',
              data: screenshot.base64,
              mimeType: 'image/png',
            },
          ],
        };
      },
    },

    // ... other browser tools
  ];
}
```

### 6.4 ACP Client Wrapper

**File**: `backend/src/acp/client.ts`

```typescript
import { spawn } from 'child_process';
import { AgentClientProtocol } from '@agentclientprotocol/sdk/client';
import { EventEmitter } from 'events';

export class AcpClient extends EventEmitter {
  private claudeCodeProcess: ChildProcess | null = null;
  private acp: AgentClientProtocol;

  async initialize() {
    // Spawn claude-code-acp process
    this.claudeCodeProcess = spawn('npx', ['@zed-industries/claude-code-acp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
      },
    });

    // Connect ACP client to stdio
    this.acp = new AgentClientProtocol({
      input: this.claudeCodeProcess.stdout,
      output: this.claudeCodeProcess.stdin,
    });

    await this.acp.initialize({
      clientInfo: {
        name: 'codee',
        version: '1.0.0',
      },
      capabilities: {
        context: {
          supports_mentions: true,
          supports_images: true,
        },
        tools: {
          supports_permission_requests: true,
        },
      },
    });

    // Handle notifications
    this.acp.on('notification', (notification) => {
      this.emit('sessionUpdate', notification);
    });
  }

  async createSession(opts: {
    mcpServerPath: string;
    sandbox: Sandbox;
    workspace: Workspace;
    organization: Organization;
  }) {
    const { mcpServerPath, sandbox, workspace, organization } = opts;

    const response = await this.acp.newSession({
      cwd: '/workspace',
      mcpServers: [
        {
          type: 'stdio',
          command: 'node',
          args: [mcpServerPath],
          env: {
            SANDBOX_ID: sandbox.id,
            WORKSPACE_ID: workspace.id,
            ORGANIZATION_ID: organization.id,
            VERCEL_TOKEN: process.env.VERCEL_TOKEN!,
            VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID!,
            VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID!,
          },
        },
      ],
    });

    return response.sessionId;
  }

  async sendMessage(sessionId: string, content: string, images?: string[]) {
    const messages = [
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: content,
          },
          ...(images || []).map(img => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: 'image/png' as const,
              data: img,
            },
          })),
        ],
      },
    ];

    return await this.acp.prompt({
      sessionId,
      messages,
    });
  }

  async cleanup() {
    if (this.claudeCodeProcess) {
      this.claudeCodeProcess.kill();
    }
  }
}
```

### 6.5 ACP Workflow Step

**File**: `backend/src/workflows/acp/runAcpAgent.ts`

```typescript
'use workflow';

import { AcpClient } from '../../acp/client';
import { sendSSE } from '../../stream/events';

export async function runAcpAgentLLM(
  agent: Agent,
  sandbox: Sandbox,
  workspace: Workspace,
  organization: Organization,
  previousMessages: Message[]
) {
  const acpClient = new AcpClient();
  await acpClient.initialize();

  try {
    // Create session with custom MCP server
    const sessionId = await acpClient.createSession({
      mcpServerPath: path.join(__dirname, '../../acp/mcp-server/index.js'),
      sandbox,
      workspace,
      organization,
    });

    // Handle notifications
    acpClient.on('sessionUpdate', async (notification) => {
      if (notification.update.sessionUpdate === 'tool_call') {
        // Save to DB
        const toolCall = await saveToolCall({
          agentId: agent.id,
          toolName: notification.update.toolCall.title,
          toolCallId: notification.update.toolCallId,
          arguments: notification.update.toolCall.rawInput,
          status: 'RUNNING',
        });

        // Stream to frontend
        sendSSE(agent.id, {
          type: 'tool_call',
          toolCall: {
            id: toolCall.id,
            name: notification.update.toolCall.title,
            input: notification.update.toolCall.rawInput,
          },
        });
      }

      if (notification.update.sessionUpdate === 'tool_update') {
        // Update tool call with result
        await updateToolCall({
          id: notification.update.toolCallId,
          result: extractTextContent(notification.update.content),
          images: extractImages(notification.update.content),
          status: 'COMPLETED',
        });

        // Stream to frontend
        sendSSE(agent.id, {
          type: 'tool_result',
          toolCallId: notification.update.toolCallId,
          result: extractTextContent(notification.update.content),
          images: extractImages(notification.update.content),
        });
      }

      if (notification.update.sessionUpdate === 'message') {
        // Save assistant message
        await saveMessage({
          agentId: agent.id,
          role: 'AGENT',
          content: extractTextContent(notification.update.content),
        });
      }
    });

    // Send initial prompt
    const userMessage = previousMessages[previousMessages.length - 1];
    await acpClient.sendMessage(
      sessionId,
      userMessage.content,
      userMessage.images
    );

    // Wait for completion
    // (handled via notifications)

  } finally {
    await acpClient.cleanup();
  }
}

function extractTextContent(content: any[]): string {
  return content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');
}

function extractImages(content: any[]): string[] {
  return content
    .filter(c => c.type === 'image')
    .map(c => c.data);
}
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

**MCP Server Tools**:
```typescript
describe('Sandbox Tools', () => {
  it('should read file contents', async () => {
    const mockSandbox = createMockSandbox();
    const tools = buildSandboxTools(mockSandbox);
    const readTool = tools.find(t => t.name === 'read_file');

    const result = await readTool.execute({
      file_path: '/workspace/test.txt'
    });

    expect(result.content[0].text).toBe('file contents');
  });
});
```

**ACP Client**:
```typescript
describe('AcpClient', () => {
  it('should create session with MCP servers', async () => {
    const client = new AcpClient();
    await client.initialize();

    const sessionId = await client.createSession({...});

    expect(sessionId).toBeTruthy();
  });
});
```

### 7.2 Integration Tests

**Full Workflow**:
```typescript
describe('ACP Workflow', () => {
  it('should execute agent task end-to-end', async () => {
    const workspace = await createTestWorkspace();
    const agent = await createTestAgent(workspace);

    await runAgentWorkflowAcp(agent.id);

    const messages = await getMessages(agent.id);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[messages.length - 1].role).toBe('AGENT');
  });
});
```

### 7.3 Performance Tests

**Latency Comparison**:
```typescript
describe('Performance', () => {
  it('should complete within acceptable latency', async () => {
    const start = Date.now();
    await runAgentWorkflowAcp(agentId);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(30000); // 30 seconds
  });
});
```

---

## 8. Rollback Plan

### 8.1 Feature Flag Rollback

If issues are discovered:
1. Set `agent.useAcp = false` for affected agents
2. System falls back to AI SDK workflow
3. No data loss (DB schema unchanged)

### 8.2 Code Rollback

If critical bugs require reverting:
1. Git revert to pre-ACP commit
2. Redeploy backend
3. All agents use AI SDK workflow

### 8.3 Data Migration Rollback

Not applicable (no schema changes required)

---

## 9. Future Extensibility

### 9.1 Multi-Agent Support

**Goal**: Support multiple CLI agents (Claude Code, Aider, others)

**Implementation**:
1. Add `agentProvider` field to Agent entity:
   ```typescript
   @Column({ type: 'varchar' })
   agentProvider: 'claude-code' | 'aider' | 'custom';
   ```

2. Create provider registry:
   ```typescript
   const AGENT_PROVIDERS = {
     'claude-code': {
       command: 'npx',
       args: ['@zed-industries/claude-code-acp'],
       env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
     },
     'aider': {
       command: 'aider-acp',
       args: [],
       env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
     },
   };
   ```

3. Dynamic provider selection:
   ```typescript
   const providerConfig = AGENT_PROVIDERS[agent.agentProvider];
   const acpClient = await createAcpClient(providerConfig);
   ```

### 9.2 Custom Auth Solutions

**Goal**: Allow users to plug in their own API keys

**Implementation**:
1. Add UI for users to configure API keys per organization
2. Store encrypted in `IntegrationConnection` table
3. Pass to agent process via environment variables
4. Support multiple auth methods:
   - API keys
   - OAuth tokens
   - Service accounts

### 9.3 Custom Tool Marketplace

**Goal**: Allow users to add custom tools to their workspaces

**Implementation**:
1. Tool definition schema in DB
2. Dynamic MCP tool registration
3. Sandboxed tool execution
4. Community tool sharing

---

## Appendices

### A. Dependencies to Add

```json
{
  "dependencies": {
    "@agentclientprotocol/sdk": "^0.13.0",
    "@modelcontextprotocol/sdk": "^1.25.2",
    "@zed-industries/claude-code-acp": "^0.13.1"
  }
}
```

### B. Environment Variables

**Required**:
- `ANTHROPIC_API_KEY` - Claude API key
- `VERCEL_TOKEN` - Vercel Sandbox access
- `VERCEL_TEAM_ID` - Vercel team
- `VERCEL_PROJECT_ID` - Vercel project

**Optional (per-integration)**:
- `KERNEL_API_KEY` - OnKernel browser automation
- `POSTHOG_API_KEY` - PostHog analytics
- `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY` - GitHub integration

### C. Resources

**ACP Documentation**:
- https://agentclientprotocol.com/overview/introduction
- https://agentclientprotocol.com/overview/architecture
- https://github.com/agentclientprotocol/agent-client-protocol

**Claude Code ACP**:
- https://github.com/zed-industries/claude-code-acp
- https://zed.dev/docs/ai/external-agents

**MCP Documentation**:
- https://modelcontextprotocol.io/
- https://github.com/modelcontextprotocol/servers

**Related Articles**:
- [Intro to ACP](https://block.github.io/goose/blog/2025/10/24/intro-to-agent-client-protocol-acp/)
- [Top AI Agent Protocols 2026](https://getstream.io/blog/ai-agent-protocols/)

---

## Conclusion

This migration represents a fundamental architectural shift that will:

1. **Enable pluggability**: Support multiple agent providers with a standard interface
2. **Improve visibility**: Full control over tool execution and observability
3. **Maintain features**: Preserve all existing capabilities (images, streaming, multi-agent)
4. **Future-proof**: Position platform for extensibility (custom tools, auth, providers)

The phased approach minimizes risk while delivering incremental value. By building alongside the existing system, we can validate each component before cutover.

**Estimated Timeline**: 5 weeks
**Risk Level**: Medium (new protocol, but well-documented)
**Impact**: High (foundational change enabling future growth)
