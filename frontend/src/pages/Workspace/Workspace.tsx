import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import style from './workspace.module.css';
import { trpc } from '../../lib/trpc';
import type { Message as MessageType, ToolCall } from '../../lib/types';
import Message from './Message';
import CreateBranch from '../../components/CreateBranch/CreateBranch';
import { BsSend } from 'react-icons/bs';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import AgentCard from './Agent';

function MessageSkeleton({ isUser, length }: { isUser: boolean; length: number }) {
    return (
        <div className={`${style.messageWrapper} ${isUser ? style.userWrapper : style.agentWrapper}`}>
            <div className={`${style.skeletonMessage} ${isUser ? style.skeletonUser : style.skeletonAgent}`}>
                {Array.from({ length }, (_, i) => (
                    <div key={i} className={style.skeletonLine} />
                ))}
            </div>
            <div className={`${style.skeletonSender} ${isUser ? style.skeletonSenderRight : ''}`} />
        </div>
    );
}

export default function Workspace() {
    const { agentId } = useParams<{ agentId: string }>();
    const navigate = useNavigate();
    const utils = trpc.useUtils();

    const { data: workspaces, isLoading: isLoadingWorkspaces } = trpc.workspace.list.useQuery();
    const { data: messagesData, isFetching: isFetchingMessages } = trpc.workspace.messages.useQuery({ agent_id: Number(agentId) }, { enabled: !!agentId });
    const createBranch = trpc.workspace.createBranch.useMutation({
        onSuccess: () => utils.workspace.list.invalidate(),
    });
    const sendMessage = trpc.workspace.sendMessage.useMutation({
        onSuccess: () =>
            utils.workspace.messages.invalidate({
                agent_id: Number(agentId),
            }),
    });

    const [userMessage, setUserMessage] = useState('');
    const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCall[]>([]);
    const chatRef = useRef<HTMLDivElement>(null);

    const workspace = workspaces?.find((w) => w.agents.some((a) => a.id === Number(agentId)));
    const currentAgent = workspace?.agents.find((a) => a.id === Number(agentId));

    // Combine server messages with streaming tool calls
    const messages: MessageType[] = useMemo(() => {
        const combinedMessages: MessageType[] = [...(messagesData ?? [])];
        if (streamingToolCalls.length > 0) {
            const pendingMessage = combinedMessages.find((m) => m.isPendingAgent);
            if (!pendingMessage) {
                combinedMessages.push({
                    id: '__pending_agent__',
                    created_at: new Date(),
                    sender: 'AGENT',
                    content: '',
                    isPendingAgent: true,
                    tool_calls: streamingToolCalls,
                });
            }
        }
        return combinedMessages;
    }, [messagesData, streamingToolCalls]);

    const lastMessage = messages[messages.length - 1];
    const hasPendingAgentMessage = messages.some((msg) => msg.sender === 'AGENT' && (msg.isPendingAgent || !msg.content));
    const showTypingIndicator = messages.length > 0 && (lastMessage?.sender === 'USER' || hasPendingAgentMessage) && currentAgent?.status !== 'FAILED';

    // SSE streaming for Codee agents
    useEffect(() => {
        if (!agentId || !currentAgent) return;
        if (currentAgent.integration !== 'Codee') return;

        const eventSource = new EventSource(`http://127.0.0.1:5001/stream/agent/${agentId}`);

        eventSource.addEventListener('status', (event: MessageEvent) => {
            const eventData = JSON.parse(event.data);
            if (eventData.step?.startsWith('tool_')) {
                const eventId = event.lastEventId || `sse_${Date.now()}`;
                setStreamingToolCalls((prev) => {
                    if (prev.some((toolCall) => toolCall.id === eventId)) return prev;
                    return [
                        ...prev,
                        {
                            id: eventId,
                            created_at: new Date(eventData.timestamp),
                            tool_name: eventData.step,
                            arguments: {},
                            result: eventData.detail ?? '',
                            status: eventData.phase ?? 'running',
                            duration_ms: null,
                        },
                    ];
                });
            }
        });

        eventSource.addEventListener('done', () => {
            setStreamingToolCalls([]);
            utils.workspace.messages.invalidate({
                agent_id: Number(agentId),
            });
            utils.workspace.list.invalidate();
        });

        eventSource.onerror = () => {
            console.log('Stream disconnected');
        };

        return () => {
            eventSource.close();
        };
    }, [agentId, currentAgent, utils]);

    useEffect(() => {
        chatRef.current?.scrollTo({
            top: chatRef.current.scrollHeight,
        });
    }, [messages]);

    useEffect(() => {
        if (!isLoadingWorkspaces && !workspace) {
            navigate('/');
        }
    }, [isLoadingWorkspaces, workspace, navigate]);

    const handleSendMessage = useCallback(async () => {
        if (!userMessage.trim()) return;
        if (sendMessage.isPending) return;
        await sendMessage.mutateAsync({
            message: userMessage,
            agent_id: Number(agentId),
        });
        setUserMessage('');
    }, [userMessage, sendMessage, agentId]);

    if (isLoadingWorkspaces || !workspace || !currentAgent) {
        return null;
    }

    return (
        <div className={style.workspaceContainer}>
            <div className={style.header}>
                <div className={style.headerLeft}>
                    <h1>{workspace.name}</h1>
                    {workspace.github_repository_name && <p className={style.repoName}>{workspace.github_repository_name}</p>}
                </div>
                <CreateBranch
                    githubRepositoryName={workspace.github_repository_name}
                    branchName={currentAgent.github_branch_name}
                    createBranch={() =>
                        createBranch.mutate({
                            agent_id: Number(agentId),
                        })
                    }
                    isLoading={createBranch.isPending}
                />
            </div>

            <div className={style.mainContent}>
                <div className={style.leftSidebar}>
                    <h3 className={style.sidebarTitle}>Agents</h3>
                    <div className={style.agentList}>
                        {workspace.agents.map((agent) => (
                            <AgentCard key={agent.id} agent={agent} isActive={agent.id === currentAgent.id} />
                        ))}
                    </div>
                </div>

                <div className={style.chatContainer}>
                    <div className={style.messagesScrollArea} ref={chatRef}>
                        <div className={style.messagesContent}>
                            {isFetchingMessages && !messagesData ? (
                                <>
                                    <MessageSkeleton isUser={true} length={Math.floor(Math.random() * 4) + 1} />
                                    <MessageSkeleton isUser={false} length={Math.floor(Math.random() * 5) + 1} />
                                    <MessageSkeleton isUser={true} length={Math.floor(Math.random() * 4) + 1} />
                                    <MessageSkeleton isUser={false} length={Math.floor(Math.random() * 5) + 1} />
                                </>
                            ) : (
                                messages.map((message, index) => {
                                    const nextMessage = messages[index + 1];
                                    const isLastInGroup = !nextMessage || nextMessage.sender !== message.sender;
                                    return <Message key={message.id} message={message} isLastInGroup={isLastInGroup} />;
                                })
                            )}
                            {showTypingIndicator && (
                                <div className={style.typingIndicatorRow}>
                                    <div className={style.typingIndicatorDots}>
                                        <span className={style.typingDot} />
                                        <span className={style.typingDot} />
                                        <span className={style.typingDot} />
                                    </div>
                                    <p className={style.sender}>Agent</p>
                                </div>
                            )}
                            {currentAgent?.status === 'FAILED' && (
                                <div className={`${style.messageWrapper} ${style.agentWrapper}`}>
                                    <div className={`${style.failedToolCallItem} ${style.toolCallItem}`}>
                                        <div className={`${style.failedToolCallHeader} ${style.toolCallHeader}`}>Failed</div>
                                        <div className={style.toolCallResult}>The workspace execution has failed.</div>
                                    </div>
                                    <p className={style.sender}>System</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={style.inputContainer}>
                        <div className={style.inputWrapper}>
                            <textarea
                                className={style.chat}
                                value={userMessage}
                                placeholder="Type a message to your agent..."
                                onChange={(event) => setUserMessage(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && !event.shiftKey && userMessage.length > 0 && !sendMessage.isPending) {
                                        event.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                            />
                            {userMessage.length > 0 && (
                                <button className={style.sendButton} onClick={handleSendMessage} disabled={sendMessage.isPending}>
                                    {sendMessage.isPending ? <AiOutlineLoading3Quarters size={16} className={style.spinIcon} /> : <BsSend size={16} />}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
