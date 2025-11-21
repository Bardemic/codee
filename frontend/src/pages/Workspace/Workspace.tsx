import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom'
import style from './workspace.module.css'
import { useCreateBranchMutation, useGetWorkspaceMessagesQuery, useGetWorkspaceQuery } from '../../app/services/workspaces/workspacesService';
import Message from './Message'; 
import CreateBranch from '../../components/CreateBranch/CreateBranch';

export default function Workspace() {
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const navigate = useNavigate();
    const { data: messages } = useGetWorkspaceMessagesQuery(workspaceId || '');
    const { data: workspace, isLoading } = useGetWorkspaceQuery(workspaceId || "");
    const chatRef = useRef<HTMLDivElement>(null);
    const [createBranch] = useCreateBranchMutation();
    const messageList = messages ?? [];
    const lastMessage = messageList[messageList.length - 1];
    const hasPendingAgentMessage = messageList.some(
        (msg) => msg.sender === "AGENT" && (msg.isPendingAgent || !msg.content)
    );
    const showTypingIndicator = messageList.length > 0 && (lastMessage?.sender === "USER" || hasPendingAgentMessage);
    useEffect(() => {
        chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
    }, [messages]);

    useEffect(() => {
        if (!isLoading && !workspace) {
            navigate("/");
        }
    }, [isLoading, workspace, navigate]);

    if (isLoading || !workspace) {
        return null;
    }

    return (
        <div className={style.workspaceContainer}>
            <div className={style.workspaceHeader}>
                <h1>{workspace.name}</h1>
                <CreateBranch github_repository_name={workspace.github_repository_name} branch_name={workspace.github_branch_name} createBranch={() => {createBranch(workspaceId || "")}}/>
            </div>
            <div className={style.chatContainer} ref={chatRef}>
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
            </div>
        </div>
    )
}