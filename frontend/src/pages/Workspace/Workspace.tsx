import { useNavigate, useParams } from 'react-router-dom'
import style from './workspace.module.css'
import { useGetWorkspaceMessagesQuery } from '../../app/services/workspaces/workspacesService';
import Message from './Message';

export default function Workspace() {
    const navigator = useNavigate();
    const { workspaceId } = useParams<{ workspaceId: string }>();

    const { data: messages } = useGetWorkspaceMessagesQuery(workspaceId || '');
    return (
        <div className={style.workspaceContainer}>
            <div className={style.chatContainer}>
                {messages?.map((message) => (
                    <Message message={message} />
                ))}
            </div>
        </div>
    )
}