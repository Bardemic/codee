import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom'
import style from './workspace.module.css'
import { useCreateBranchMutation, useGetWorkspaceMessagesQuery, useGetWorkspaceQuery, useNewMessageMutation } from '../../app/services/workspaces/workspacesService';
import Message from './Message'; 
import CreateBranch from '../../components/CreateBranch/CreateBranch';
import { BsSend } from 'react-icons/bs';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';

export default function Workspace() {
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const navigate = useNavigate();
    const { data: messages } = useGetWorkspaceMessagesQuery(workspaceId || '');
    const { data: workspace, isLoading } = useGetWorkspaceQuery(workspaceId || "");
    const chatRef = useRef<HTMLDivElement>(null);
    const [createBranch, { isLoading: isCreatingBranch }] = useCreateBranchMutation();
    const [newMessage, { isLoading: isSendingMessage }] = useNewMessageMutation();
    const [userMessage, setUserMessage] = useState("");

    const messageList = messages ?? [];
    const lastMessage = messageList[messageList.length - 1];
    const hasPendingAgentMessage = messageList.some(
        (msg) => msg.sender === "AGENT" && (msg.isPendingAgent || !msg.content)
    );
    const showTypingIndicator = messageList.length > 0 && (lastMessage?.sender === "USER" || hasPendingAgentMessage) && workspace?.status !== "FAILED";

    useEffect(() => {
        chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
    }, [messages]);

    useEffect(() => {
        if (!isLoading && !workspace) {
            navigate("/");
        }
    }, [isLoading, workspace, navigate]);

    async function sendMessage() {
        if (!userMessage.trim()) return;
        if (isSendingMessage) return;
        await newMessage({ message: userMessage, workspace_id: Number(workspaceId) }).unwrap();
        setUserMessage("");
    }

    if (isLoading || !workspace) {
        return null;
    }

    return (
        <div className={style.workspaceContainer}>
            <div className={style.workspaceHeader}>
                <div className={style.headerLeft}>
                    <h1>{workspace.name}</h1>
                    {workspace.github_repository_name && (
                        <p className={style.repoName}>{workspace.github_repository_name}</p>
                    )}
                </div>
                <CreateBranch
                    githubRepositoryName={workspace.github_repository_name}
                    branchName={workspace.github_branch_name}
                    createBranch={() => {createBranch(workspaceId || "")}}
                    isLoading={isCreatingBranch}
                />
            </div>
            <div className={style.chatContainer}>
                <div className={style.messages} ref={chatRef}>
                    {messageList.map((message) => (
                        <Message key={message.id} message={message} />
                    ))}
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
                    {workspace?.status === "FAILED" && (
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
                <div className={style.inputWrapper}>
                    <textarea 
                        className={style.chat} 
                        value={userMessage}
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
    )
}
