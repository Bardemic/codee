import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom'
import style from './workspace.module.css'
import { useCreateBranchMutation, useGetWorkspaceMessagesQuery, useWorkspaceByAgentId, useNewMessageMutation } from '../../app/services/workspaces/workspacesService';
import Message from './Message'; 
import CreateBranch from '../../components/CreateBranch/CreateBranch';
import { BsSend } from 'react-icons/bs';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import AgentCard from './Agent';

function MessageSkeleton({ isUser, length }: { isUser: boolean, length: number }) {
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
    const { currentData: messages, isFetching: isFetchingMessages } = useGetWorkspaceMessagesQuery(agentId || '');
    const { workspace, currentAgent, isLoading, isFetching } = useWorkspaceByAgentId(agentId);
    const chatRef = useRef<HTMLDivElement>(null);
    const [createBranch, { isLoading: isCreatingBranch }] = useCreateBranchMutation();
    const [newMessage, { isLoading: isSendingMessage }] = useNewMessageMutation();
    const [userMessage, setUserMessage] = useState("");

    const messageList = messages ?? [];
    const lastMessage = messageList[messageList.length - 1];
    const hasPendingAgentMessage = messageList.some(
        (msg) => msg.sender === "AGENT" && (msg.isPendingAgent || !msg.content)
    );
    const showTypingIndicator = messageList.length > 0 && (lastMessage?.sender === "USER" || hasPendingAgentMessage) && currentAgent?.status !== "FAILED";

    useEffect(() => {
        chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
    }, [messages]);

    useEffect(() => {
        if (!isLoading && !isFetching && !workspace) {
            navigate("/");
        }
    }, [isLoading, isFetching, workspace, navigate]);

    async function sendMessage() {
        if (!userMessage.trim()) return;
        if (isSendingMessage) return;
        await newMessage({ message: userMessage, agent_id: Number(agentId) }).unwrap();
        setUserMessage("");
    }

    if (isLoading || !workspace || !currentAgent) {
        return null;
    }

    return (
        <div className={style.workspaceContainer}>
            <div className={style.header}>
                <div className={style.headerLeft}>
                    <h1>{workspace.name}</h1>
                    {workspace.github_repository_name && (
                        <p className={style.repoName}>{workspace.github_repository_name}</p>
                    )}
                </div>
                <CreateBranch
                    githubRepositoryName={workspace.github_repository_name}
                    branchName={currentAgent.github_branch_name}
                    createBranch={() => {createBranch(agentId || "")}}
                    isLoading={isCreatingBranch}
                />
            </div>

            <div className={style.mainContent}>
                <div className={style.leftSidebar}>
                    <h3 className={style.sidebarTitle}>Agents</h3>
                    <div className={style.agentList}>
                        {workspace.agents.map((agent) => (
                            <AgentCard 
                                key={agent.id} 
                                agent={agent} 
                                isActive={agent.id === currentAgent.id}
                            />
                        ))}
                    </div>
                </div>

                <div className={style.chatContainer}>
                    <div className={style.messagesScrollArea} ref={chatRef}>
                        <div className={style.messagesContent}>
                            {isFetchingMessages ? (
                                <>
                                    <MessageSkeleton isUser={true} length={Math.floor(Math.random() * 4) + 1} />
                                    <MessageSkeleton isUser={false} length={Math.floor(Math.random() * 5) + 1} />
                                    <MessageSkeleton isUser={true} length={Math.floor(Math.random() * 4) + 1} />
                                    <MessageSkeleton isUser={false} length={Math.floor(Math.random() * 5) + 1} />
                                </>
                            ) : messageList.map((message, index) => {
                                const nextMessage = messageList[index + 1];
                                const isLastInGroup = !nextMessage || nextMessage.sender !== message.sender;
                                return (
                                    <Message key={message.id} message={message} isLastInGroup={isLastInGroup} />
                                );
                            })}
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
                            {currentAgent?.status === "FAILED" && (
                                <div className={`${style.messageWrapper} ${style.agentWrapper}`}>
                                    <div className={`${style.failedToolCallItem} ${style.toolCallItem}`}>
                                        <div className={`${style.failedToolCallHeader} ${style.toolCallHeader}`}>
                                            Failed
                                        </div>
                                        <div className={style.toolCallResult}>
                                            The workspace execution has failed.
                                        </div>
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
                                onChange={(e) => setUserMessage(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && userMessage.length > 0 && !isSendingMessage) {
                                        e.preventDefault();
                                        sendMessage();
                                    }
                                }}
                            />
                            {userMessage.length > 0 && (
                                <button className={style.sendButton} onClick={sendMessage} disabled={isSendingMessage}>
                                    {isSendingMessage ? <AiOutlineLoading3Quarters size={16} className={style.spinIcon} /> : <BsSend size={16} />}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
