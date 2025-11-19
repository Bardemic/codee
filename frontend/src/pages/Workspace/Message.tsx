import type { Message } from "../../app/services/workspaces/workspacesService";
import style from './workspace.module.css'
export default function Message({ message }: { message: Message }) {
    const isUser = message.sender === "USER";
    const senderLabel = isUser ? "You" : "Agent";
    const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
    const showBubble = Boolean(message.content);
    const showSenderLabel = !message.isPendingAgent;

    return (
        <div className={`${style.messageWrapper} ${isUser ? style.userWrapper : style.agentWrapper}`}>
            {!isUser && hasToolCalls && (
                <div className={style.toolCallStack}>
                    {message.tool_calls.map((toolCall) => (
                        <div key={toolCall.id} className={style.toolCallItem}>
                            <div className={style.toolCallHeader}>
                                <strong>{toolCall.tool_name}</strong>
                                {toolCall.duration_ms && <span>{toolCall.duration_ms}ms</span>}
                            </div>
                            {toolCall.result && (
                                <div className={style.toolCallResult}>{toolCall.result}</div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {showBubble && (
                <div className={`${isUser ? style.userMessage : style.agentMessage} ${style.message}`}>
                    <div className={style.messageContent}>{message.content}</div>
                </div>
            )}
            {showSenderLabel && <p className={style.sender}>{senderLabel}</p>}
        </div>
    )
}