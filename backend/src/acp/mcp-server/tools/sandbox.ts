/**
 * Sandbox tools for MCP server
 * These tools interact with Vercel Sandbox for file operations and command execution
 */

import type { Sandbox } from "@vercel/sandbox";
import type { McpTool, McpToolResult } from "../../types";
import { formatErrorMessage } from "../../utils";
import { z } from "zod";

/**
 * Helper to convert stream to string
 */
async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Build sandbox tools for the MCP server
 */
export function buildSandboxTools(sandbox: Sandbox): McpTool[] {
  return [
    // List files in a directory
    {
      name: "list_files",
      description: "List files in a directory within the repository",
      inputSchema: {
        type: "object",
        properties: {
          relativePath: {
            type: "string",
            description: "Relative path to list (use '.' for repo root)",
          },
        },
        required: ["relativePath"],
      },
      execute: async (input: { relativePath: string }): Promise<McpToolResult> => {
        try {
          const { relativePath } = input;
          const result = await sandbox.runCommand({
            cmd: "bash",
            args: ["-c", `ls -1 ${relativePath}`],
          });
          const output = await result.stdout();

          return {
            content: [
              {
                type: "text",
                text: output.trim() || "Empty directory",
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error listing files: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Read file contents
    {
      name: "read_file",
      description: "Read the contents of a file from the repository",
      inputSchema: {
        type: "object",
        properties: {
          relativeFilePath: {
            type: "string",
            description: "Relative path to the file to read",
          },
        },
        required: ["relativeFilePath"],
      },
      execute: async (input: { relativeFilePath: string }): Promise<McpToolResult> => {
        try {
          const { relativeFilePath } = input;
          const stream = await sandbox.readFile({ path: relativeFilePath });
          const content = stream ? await streamToString(stream) : "";

          return {
            content: [
              {
                type: "text",
                text: content || "Empty file",
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error reading file: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Write/update file
    {
      name: "write_file",
      description: "Write or overwrite a file with new content",
      inputSchema: {
        type: "object",
        properties: {
          relativeFilePath: {
            type: "string",
            description: "Relative path to the file to write",
          },
          content: {
            type: "string",
            description: "New file contents",
          },
        },
        required: ["relativeFilePath", "content"],
      },
      execute: async (input: {
        relativeFilePath: string;
        content: string;
      }): Promise<McpToolResult> => {
        try {
          const { relativeFilePath, content } = input;
          await sandbox.writeFiles([
            {
              path: relativeFilePath,
              content: Buffer.from(content),
            },
          ]);

          return {
            content: [
              {
                type: "text",
                text: `Successfully wrote to ${relativeFilePath}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error writing file: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Run shell command
    {
      name: "run_command",
      description:
        "Execute a shell command in the sandbox. For dev servers, use background execution with logs.",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description:
              'Shell command to run. For dev servers, use: "npm run dev &> devserver.log & sleep 2; tail devserver.log"',
          },
        },
        required: ["command"],
      },
      execute: async (input: { command: string }): Promise<McpToolResult> => {
        try {
          const { command } = input;
          const result = await sandbox.runCommand({
            cmd: "bash",
            args: ["-c", command],
          });

          const stdout = await result.stdout();
          const stderr = await result.stderr();
          const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : "");

          return {
            content: [
              {
                type: "text",
                text: output || "Command completed with no output",
              },
            ],
            isError: result.exitCode !== 0,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error running command: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },
  ];
}
