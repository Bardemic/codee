import type { Message } from "../../app/services/workspaces/workspacesService";
import style from './workspace.module.css'
export default function Message({ message }: { message: Message }) {
    console.log(message)
    return (
        <div className={message.sender === "USER" ? style.userMessage : style.agentMessage}>
            {message.content}
        </div>
    )
}