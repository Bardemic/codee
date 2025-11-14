import type { Message } from "../../app/services/workspaces/workspacesService";
import style from './workspace.module.css'
export default function Message({ message }: { message: Message }) {
    const isUser = message.sender === "USER";
    const senderLabel = isUser ? "You" : "Agent";
    return (
        <div className={`${style.messageWrapper} ${isUser ? style.userWrapper : style.agentWrapper}`}>
            <div className={`${isUser ? style.userMessage : style.agentMessage} ${style.message}`}>
                <div className={style.messageContent}>{message.content}</div>
            </div>
            <p className={style.sender}>{senderLabel}</p>
        </div>
    )
}