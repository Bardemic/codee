import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom'
import style from './workspace.module.css'
import { useGetWorkspaceMessagesQuery } from '../../app/services/workspaces/workspacesService';
import Message from './Message';

export default function Workspace() {
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const { data: messages } = useGetWorkspaceMessagesQuery(workspaceId || '');
    const chatRef = useRef<HTMLDivElement>(null);

    const messageList = messages ?? [];
    const lastMessage = messageList[messageList.length - 1];
    const hasPendingAgentMessage = messageList.some(
        (msg) => msg.sender === "AGENT" && (msg.isPendingAgent || !msg.content)
    );
    const showTypingIndicator = messageList.length > 0 && (lastMessage?.sender === "USER" || hasPendingAgentMessage);
    useEffect(() => {
        chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
    }, [messages]);
    return (
        <div className={style.workspaceContainer}>
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