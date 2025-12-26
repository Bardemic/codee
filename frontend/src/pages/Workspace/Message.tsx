import type { Message } from '../../lib/types';
import style from './workspace.module.css';

interface MessageProps {
    message: Message;
    isLastInGroup: boolean;
}

export default function Message({ message, isLastInGroup }: MessageProps) {
    const isUser = message.sender === 'USER';
    const senderLabel = isUser ? 'You' : 'Agent';
    const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
    const showBubble = Boolean(message.content);
    const showSenderLabel = !message.isPendingAgent && isLastInGroup;

    const notLastClass = !isLastInGroup ? style.notLastInGroup : '';

    return (
        <div className={`${style.messageWrapper} ${isUser ? style.userWrapper : style.agentWrapper} ${notLastClass}`}>
            {!isUser && hasToolCalls && (
                <div className={style.toolCallStack}>
                    {message.tool_calls.map((toolCall) => (
                        <div key={toolCall.id} className={style.toolCallItem}>
                            <div className={style.toolCallHeader}>
                                <strong>{toolCall.tool_name}</strong>
                                {toolCall.duration_ms && (
                                    <span>
                                        {toolCall.duration_ms}
                                        ms
                                    </span>
                                )}
                            </div>
                            {toolCall.result && <div className={style.toolCallResult}>{toolCall.result}</div>}
                        </div>
                    ))}
                </div>
            )}
            {showBubble && (
                <div className={`${isUser ? style.userMessage : style.agentMessage} ${style.message} ${notLastClass}`}>
                    <div className={style.messageContent}>{message.content}</div>
                </div>
            )}
            {showSenderLabel && <p className={style.sender}>{senderLabel}</p>}
        </div>
    );
}
