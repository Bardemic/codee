/**
 * ACP Notification Handlers
 * Convert ACP notifications to SSE events and database operations
 */

import type { SessionNotification } from "@agentclientprotocol/sdk";
import { sendSSE, emitStatus } from "../stream/events";
import { AppDataSource } from "../db/data-source";
import { Message } from "../db/entities/Message";
import { ToolCall } from "../db/entities/ToolCall";
import { Agent } from "../db/entities/Agent";
import { extractTextContent, extractImages } from "./utils";

/**
 * Handle ACP session notifications
 */
export async function handleAcpNotification(
  notification: SessionNotification,
  agentId: number
): Promise<void> {
  const { sessionId, update } = notification;

  switch (update.sessionUpdate) {
    case "tool_call":
      await handleToolCall(agentId, update);
      break;

    case "tool_update":
      await handleToolUpdate(agentId, update);
      break;

    case "message":
      await handleMessage(agentId, update);
      break;

    case "reasoning":
      await handleReasoning(agentId, update);
      break;

    case "status":
      await handleStatus(agentId, update);
      break;

    default:
      console.error("[ACP] Unknown notification type:", update);
  }
}

/**
 * Handle tool call notification
 */
async function handleToolCall(agentId: number, update: any): Promise<void> {
  const { toolCallId, toolCall } = update;

  // Create tool call record in database
  const agent = await AppDataSource.getRepository(Agent).findOne({
    where: { id: agentId },
  });

  if (!agent) {
    console.error("[ACP] Agent not found:", agentId);
    return;
  }

  // Get the latest message for this agent
  const latestMessage = await AppDataSource.getRepository(Message).findOne({
    where: { agent: { id: agentId } },
    order: { createdAt: "DESC" },
  });

  if (!latestMessage) {
    console.error("[ACP] No message found for agent:", agentId);
    return;
  }

  // Create tool call
  const toolCallEntity = AppDataSource.getRepository(ToolCall).create({
    agent,
    message: latestMessage,
    toolName: toolCall.title || "unknown",
    arguments: toolCall.rawInput || {},
    result: "",
    images: [],
    status: "running",
  });

  await AppDataSource.getRepository(ToolCall).save(toolCallEntity);

  // Send SSE event to frontend
  sendSSE(agentId, {
    type: "tool_call",
    toolCall: {
      id: toolCallEntity.id,
      name: toolCall.title,
      input: toolCall.rawInput,
    },
  });

  // Emit status
  await emitStatus(agentId, "running", "tool_call", toolCall.title, {
    arguments: toolCall.rawInput,
  });
}

/**
 * Handle tool update/result notification
 */
async function handleToolUpdate(agentId: number, update: any): Promise<void> {
  const { toolCallId, content } = update;

  // Find the tool call by ID (we'll need to track the mapping)
  // For now, get the latest tool call for this agent
  const toolCall = await AppDataSource.getRepository(ToolCall).findOne({
    where: {
      agent: { id: agentId },
      status: "running",
    },
    order: { createdAt: "DESC" },
  });

  if (!toolCall) {
    console.error("[ACP] No running tool call found for agent:", agentId);
    return;
  }

  // Extract text and images from content
  const resultText = extractTextContent(content);
  const images = extractImages(content).map((data) => ({
    data,
    mimeType: "image/png",
  }));

  // Update tool call
  toolCall.result = resultText;
  toolCall.images = images;
  toolCall.status = "success";

  await AppDataSource.getRepository(ToolCall).save(toolCall);

  // Send SSE event to frontend
  sendSSE(agentId, {
    type: "tool_result",
    toolCallId: toolCall.id,
    result: resultText,
    images,
  });

  // Emit status
  await emitStatus(agentId, "running", "tool_result", resultText.slice(0, 100), {
    toolCallId: toolCall.id,
  });
}

/**
 * Handle assistant message notification
 */
async function handleMessage(agentId: number, update: any): Promise<void> {
  const { content } = update;

  const agent = await AppDataSource.getRepository(Agent).findOne({
    where: { id: agentId },
  });

  if (!agent) {
    console.error("[ACP] Agent not found:", agentId);
    return;
  }

  // Extract text from content
  const messageText = extractTextContent(content);

  // Create message
  const message = AppDataSource.getRepository(Message).create({
    agent,
    role: "AGENT",
    content: messageText,
    images: [],
    reasoning: "",
  });

  await AppDataSource.getRepository(Message).save(message);

  // Send SSE event to frontend
  sendSSE(agentId, {
    type: "message",
    message: {
      id: message.id,
      role: "AGENT",
      content: messageText,
    },
  });
}

/**
 * Handle reasoning notification
 */
async function handleReasoning(agentId: number, update: any): Promise<void> {
  const { content } = update;

  const reasoningText = extractTextContent(content);

  // Send SSE event to frontend
  sendSSE(agentId, {
    type: "reasoning",
    content: reasoningText,
  });

  // Emit status
  await emitStatus(agentId, "running", "reasoning", reasoningText.slice(0, 100));
}

/**
 * Handle status notification
 */
async function handleStatus(agentId: number, update: any): Promise<void> {
  const { status, message } = update;

  // Send SSE event to frontend
  sendSSE(agentId, {
    type: "status",
    status,
    message,
  });

  // Emit status
  await emitStatus(agentId, status, "status", message || "");
}
