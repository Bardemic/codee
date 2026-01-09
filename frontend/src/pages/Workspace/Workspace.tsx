import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import style from './workspace.module.css';
import { trpc } from '../../lib/trpc';
import type { Message as MessageType, ToolCall, MessageImage } from '../../lib/types';
import Message from './Message';
import CreateBranch from '../../components/CreateBranch/CreateBranch';
import { BsSend } from 'react-icons/bs';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { IoClose, IoImage } from 'react-icons/io5';
import AgentCard from './AgentCard';

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
    const [attachedImages, setAttachedImages] = useState<MessageImage[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const chatRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const workspace = workspaces?.find((workspace) => workspace.agents.some((agent) => agent.id === Number(agentId)));
    const currentAgent = workspace?.agents.find((agent) => agent.id === Number(agentId));

    const messages: MessageType[] = useMemo(() => {
        const combinedMessages: MessageType[] = [...(messagesData ?? [])];
        const lastMessage = combinedMessages[combinedMessages.length - 1];
        const pendingIndex = combinedMessages.findIndex((msg) => msg.isPendingAgent);
        const isAwaitingAgent = lastMessage?.sender === 'USER' && currentAgent?.status !== 'FAILED';

        if (pendingIndex !== -1) {
            if (streamingToolCalls.length > 0) {
                combinedMessages[pendingIndex] = {
                    ...combinedMessages[pendingIndex],
                    tool_calls: streamingToolCalls,
                };
            }
        } else if (isAwaitingAgent || streamingToolCalls.length > 0) {
            combinedMessages.push({
                id: '__pending_agent__',
                created_at: new Date(),
                sender: 'AGENT',
                content: '',
                isPendingAgent: true,
                tool_calls: streamingToolCalls,
                images: [],
            });
        }

        return combinedMessages;
    }, [messagesData, streamingToolCalls, currentAgent]);

    const lastMessage = messages[messages.length - 1];
    const hasPendingAgentMessage = messages.some((msg) => msg.sender === 'AGENT' && (msg.isPendingAgent || !msg.content));
    const showTypingIndicator = messages.length > 0 && lastMessage?.sender === 'USER' && !hasPendingAgentMessage && currentAgent?.status !== 'FAILED';

    // SSE streaming for Codee agents
    useEffect(() => {
        if (!agentId || !currentAgent) return;
        if (currentAgent.integration !== 'Codee') return;

        const eventSource = new EventSource(`http://127.0.0.1:5001/stream/agent/${agentId}`);

        eventSource.addEventListener('status', (event: MessageEvent) => {
            const eventData = JSON.parse(event.data);
            if (eventData.step === 'agent_branch_created') {
                utils.workspace.list.invalidate();
            }
            const isToolActivity =
                eventData.step === 'reasoning' || eventData.step?.startsWith('tool_') || eventData.step?.startsWith('agent_');

            if (isToolActivity) {
                const eventId = event.lastEventId || `sse_${Date.now()}`;
                const parsedArguments = (() => {
                    if (!eventData.arguments) return {};
                    try {
                        return JSON.parse(eventData.arguments);
                    } catch {
                        return eventData.arguments;
                    }
                })();

                setStreamingToolCalls((prev) => {
                    if (prev.some((toolCall) => toolCall.id === eventId)) return prev;
                    return [
                        ...prev,
                        {
                            id: eventId,
                            created_at: new Date(eventData.timestamp),
                            tool_name: eventData.step,
                            arguments: parsedArguments,
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

    const processFiles = useCallback(async (files: FileList | File[]) => {
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
        const newImages: MessageImage[] = [];

        for (const file of Array.from(files)) {
            if (!validTypes.includes(file.type)) continue;
            if (file.size > 10 * 1024 * 1024) continue; // 10MB limit

            try {
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = reader.result as string;
                        const base64Data = result.split(',')[1];
                        resolve(base64Data);
                    };
                    reader.onerror = () => {
                        reject(new Error(`Failed to read file: ${file.name}`));
                    };
                    reader.readAsDataURL(file);
                });

                newImages.push({
                    data: base64,
                    mimeType: file.type,
                });
            } catch (error) {
                console.error('Error processing image file:', error);
            }
        }

        setAttachedImages((prev) => [...prev, ...newImages]);
    }, []);

    const handlePaste = useCallback(
        (event: React.ClipboardEvent) => {
            const items = event.clipboardData.items;
            const imageFiles: File[] = [];

            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) imageFiles.push(file);
                }
            }

            if (imageFiles.length > 0) {
                event.preventDefault();
                processFiles(imageFiles);
            }
        },
        [processFiles]
    );

    const handleSendMessage = useCallback(async () => {
        if (!userMessage.trim() && attachedImages.length === 0) return;
        if (sendMessage.isPending) return;
        await sendMessage.mutateAsync({
            message: userMessage,
            agent_id: Number(agentId),
            images: attachedImages,
        });
        setUserMessage('');
        setAttachedImages([]);
    }, [userMessage, sendMessage, agentId, attachedImages]);

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
                        {workspace.agents.map((workspaceAgent) => (
                            <AgentCard key={workspaceAgent.id} agent={workspaceAgent} isActive={workspaceAgent.id === currentAgent.id} />
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
                            {currentAgent.status === 'FAILED' && (
                                <div className={`${style.messageWrapper} ${style.agentWrapper}`}>
                                    <div className={style.failedToolCallItem}>
                                        <div className={style.failedToolCallHeader}>Failed</div>
                                        <div className={style.failedToolCallResult}>The workspace execution has failed.</div>
                                    </div>
                                    <p className={style.sender}>System</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div
                        className={style.inputContainer}
                        onDragOver={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setIsDragging(true);
                        }}
                        onDragLeave={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setIsDragging(false);
                        }}
                        onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setIsDragging(false);
                            processFiles(event.dataTransfer.files);
                        }}
                    >
                        {isDragging && <div className={style.dropOverlay} />}
                        <div className={style.inputWrapper}>
                            <div className={style.textareaWrapper}>
                                {attachedImages.length > 0 && (
                                    <div className={style.imagePreviewContainer}>
                                        {attachedImages.map((image, index) => (
                                            <div key={index} className={style.imagePreview}>
                                                <img src={`data:${image.mimeType};base64,${image.data}`} alt={`Attachment ${index + 1}`} />
                                                <button
                                                    className={style.removeImageButton}
                                                    onClick={() => setAttachedImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index))}
                                                    type="button"
                                                >
                                                    <IoClose size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button type="button" className={style.attachButton} onClick={() => fileInputRef.current?.click()} title="Attach images">
                                    <IoImage size={18} />
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className={style.hiddenFileInput}
                                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                                    multiple
                                    onChange={(event) => event.target.files && processFiles(event.target.files)}
                                />
                                <textarea
                                    className={style.chat}
                                    value={userMessage}
                                    placeholder="Type a message to your agent..."
                                    onChange={(event) => setUserMessage(event.target.value)}
                                    onPaste={handlePaste}
                                    onKeyDown={(event) => {
                                        if (
                                            event.key === 'Enter' &&
                                            !event.shiftKey &&
                                            (userMessage.length > 0 || attachedImages.length > 0) &&
                                            !sendMessage.isPending
                                        ) {
                                            event.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                />
                                <button
                                    className={style.sendButton}
                                    onClick={handleSendMessage}
                                    disabled={sendMessage.isPending || (userMessage.length === 0 && attachedImages.length === 0)}
                                    title="Send message"
                                >
                                    {sendMessage.isPending ? <AiOutlineLoading3Quarters size={16} className={style.spinIcon} /> : <BsSend size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
