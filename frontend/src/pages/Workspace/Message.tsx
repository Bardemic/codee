import type { Message } from '../../lib/types';
import style from './workspace.module.css';
import ToolsContainer from './ToolsContainer';
import { useState } from 'react';

interface MessageProps {
    message: Message;
    isLastInGroup: boolean;
}

export default function Message({ message, isLastInGroup }: MessageProps) {
    const isUser = message.sender === 'USER';
    const senderLabel = isUser ? 'You' : 'Agent';
    const showBubble = Boolean(message.content);
    const showSenderLabel = !message.isPendingAgent && isLastInGroup;
    const [showFullContent, setShowFullContent] = useState(false);
    const notLastClass = !isLastInGroup ? style.notLastInGroup : '';

    return (
        <div className={`${style.messageWrapper} ${isUser ? style.userWrapper : style.agentWrapper} ${notLastClass}`}>
            {!isUser && <ToolsContainer toolCalls={message.tool_calls} showFullContent={showFullContent} setShowFullContent={setShowFullContent} />}
            {showBubble && (
                <div className={`${isUser ? style.userMessage : style.agentMessage} ${style.message} ${notLastClass}`}>
                    <div className={style.messageContent}>{message.content}</div>
                </div>
            )}
            {showSenderLabel && <p className={style.sender}>{senderLabel}</p>}
        </div>
    );
}
