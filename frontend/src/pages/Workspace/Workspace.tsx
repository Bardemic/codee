import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom'
import style from './workspace.module.css'
import { useGetWorkspaceMessagesQuery } from '../../app/services/workspaces/workspacesService';
import Message from './Message';

export default function Workspace() {
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const { data: messages } = useGetWorkspaceMessagesQuery(workspaceId || '');
    const chatRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
    }, [messages]);
    return (
        <div className={style.workspaceContainer}>
            <div className={style.chatContainer} ref={chatRef}>
                {messages?.map((message) => (
                    <Message key={message.id} message={message} />
                ))}
            </div>
        </div>
    )
}