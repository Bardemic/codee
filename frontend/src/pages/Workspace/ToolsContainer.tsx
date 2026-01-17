import type { ToolCall } from '../../lib/types';
import style from './ToolsContainer.module.css';
import { BsChevronDown, BsX } from 'react-icons/bs';
import { useState } from 'react';

function formatToolCommand(toolName: string, args: Record<string, unknown> | undefined): string {
    if (!args || Object.keys(args).length === 0) {
        return toolName;
    }
    
    const formattedArgs = Object.entries(args)
        .map(([key, value]) => {
            const strValue = typeof value === 'string' ? value : JSON.stringify(value);
            // Truncate long values for display
            const displayValue = strValue.length > 50 ? strValue.slice(0, 47) + '...' : strValue;
            return `--${key} ${displayValue}`;
        })
        .join(' ');
    
    return `${toolName} ${formattedArgs}`;
}

export function ScreenshotImage({ data, mimeType }: { data: string; mimeType: string }) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <>
            <img
                src={`data:${mimeType};base64,${data}`}
                alt="Screenshot"
                className={style.screenshotImage}
                onClick={() => setIsExpanded(true)}
            />
            {isExpanded && (
                <div className={style.imageOverlay} onClick={() => setIsExpanded(false)}>
                    <div className={style.imageOverlayContent}>
                        <img
                            src={`data:${mimeType};base64,${data}`}
                            alt="Screenshot (full size)"
                            className={style.screenshotImageFull}
                        />
                    </div>
                </div>
            )}
        </>
    );
}

export default function ToolsContainer({
    toolCalls,
    showFullContent,
    setShowFullContent,
    isThinking,
}: {
    toolCalls: ToolCall[];
    showFullContent: boolean;
    setShowFullContent: (showFullContent: boolean) => void;
    isThinking: boolean;
}) {
    if (!showFullContent) {
        const lastToolCall = toolCalls[toolCalls.length - 1];

        return (
            <div className={style.previewContainer} onClick={() => setShowFullContent(true)}>
                <div className={style.previewHeader}>
                    <BsChevronDown size={16} />
                </div>
                <div>
                    <div className={style.thinkingBadge}>
                        {isThinking && <span className={style.spinner} />}
                        <p className={isThinking ? style.previewTitle : style.previewTitleFinished}>{isThinking ? 'Thinking' : 'Finished thinking'}</p>
                    </div>
                    <div className={style.previewContent}>
                        <p>
                            {lastToolCall
                                ? lastToolCall.tool_name !== 'reasoning'
                                    ? formatToolCommand(lastToolCall.tool_name, lastToolCall.arguments)
                                    : `${lastToolCall.result}`
                                : 'Setting up sandbox...'}
                        </p>
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className={style.toolCallStack}>
            <div className={style.stackHeader} onClick={() => setShowFullContent(false)}>
                <span className={style.stackTitle}>Activity</span>
                <div className={style.closeButton}>
                    <BsX size={16} />
                </div>
            </div>
            {toolCalls.map((toolCall) => (
                <div key={toolCall.id} className={style.toolCallItem}>
                    <div className={style.toolCallHeader}>
                        {toolCall.tool_name !== 'reasoning' && (
                            <span>
                                <span className={style.prompt}>$</span>{' '}
                                <span className={style.toolName}>{toolCall.tool_name}</span>
                                {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
                                    <span className={style.toolArgs}>
                                        {Object.entries(toolCall.arguments).map(([key, value], i) => {
                                            const strValue = typeof value === 'string' ? value : JSON.stringify(value);
                                            const displayValue = strValue.length > 60 ? strValue.slice(0, 57) + '...' : strValue;
                                            return (
                                                <span key={key}>
                                                    {' '}
                                                    <span className={style.argKey}>--{key}</span>{' '}
                                                    <span className={style.argValue}>{displayValue}</span>
                                                </span>
                                            );
                                        })}
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                    {toolCall.result && (
                        <div className={style.toolCallResult}>
                            {typeof toolCall.result === 'object' ? JSON.stringify(toolCall.result, null, 2) : toolCall.result}
                        </div>
                    )}
                    {toolCall.images && toolCall.images.length > 0 && (
                        <div className={style.screenshotContainer}>
                            {toolCall.images.map((image, index) => (
                                <ScreenshotImage key={index} data={image.data} mimeType={image.mimeType} />
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
