import type { Message, MessageImage } from '../../lib/types';
import style from './workspace.module.css';
import ToolsContainer, { ScreenshotImage } from './ToolsContainer';
import { useState, useMemo, type ReactNode } from 'react';

interface MessageProps {
    message: Message;
    isLastInGroup: boolean;
}

function parseMessageContent(content: string, toolCallImages: MessageImage[]): ReactNode[] {
    const pattern = /\[codee_image_(\d+)\]/g;
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(content)) !== null) {
        if (match.index > lastIndex) {
            parts.push(content.slice(lastIndex, match.index));
        }

        const imageIndex = parseInt(match[1], 10) - 1;
        if (imageIndex >= 0 && imageIndex < toolCallImages.length) {
            const image = toolCallImages[imageIndex];
            parts.push(
                <div key={`image-${match.index}`} className={style.inlineImageWrapper}>
                    <ScreenshotImage data={image.data} mimeType={image.mimeType} />
                </div>
            );
        } else {
            parts.push(match[0]);
        }

        lastIndex = pattern.lastIndex;
    }

    if (lastIndex < content.length) {
        parts.push(content.slice(lastIndex));
    }

    return parts;
}

export default function Message({ message, isLastInGroup }: MessageProps) {
    const isUser = message.sender === 'USER';
    const senderLabel = isUser ? 'You' : 'Agent';
    const hasImages = message.images.length > 0;
    const showBubble = message.content || hasImages;
    const showSenderLabel = !message.isPendingAgent && isLastInGroup;
    const [showFullContent, setShowFullContent] = useState(false);
    const notLastClass = !isLastInGroup ? style.notLastInGroup : '';

    const toolCallImages = useMemo(() => {
        const images: MessageImage[] = [];
        for (const toolCall of message.tool_calls) {
            if (toolCall.images && toolCall.images.length > 0) {
                images.push(...toolCall.images);
            }
        }
        return images;
    }, [message.tool_calls]);

    const renderedContent = useMemo(() => {
        if (!message.content) return null;
        return parseMessageContent(message.content, toolCallImages);
    }, [message.content, toolCallImages]);

    return (
        <div className={`${style.messageWrapper} ${isUser ? style.userWrapper : style.agentWrapper} ${notLastClass}`}>
            {!isUser && (
                <ToolsContainer
                    toolCalls={message.tool_calls}
                    showFullContent={showFullContent}
                    setShowFullContent={setShowFullContent}
                    isThinking={Boolean(message.isPendingAgent)}
                />
            )}
            {showBubble && (
                <div className={`${isUser ? style.userMessage : style.agentMessage} ${style.message} ${notLastClass}`}>
                    {hasImages && (
                        <div className={style.messageImages}>
                            {message.images.map((image, index) => (
                                <img
                                    key={index}
                                    src={`data:${image.mimeType};base64,${image.data}`}
                                    alt={`Image ${index + 1}`}
                                    className={style.messageImage}
                                />
                            ))}
                        </div>
                    )}
                    {renderedContent && <div className={style.messageContent}>{renderedContent}</div>}
                </div>
            )}
            {showSenderLabel && <p className={style.sender}>{senderLabel}</p>}
        </div>
    );
}
