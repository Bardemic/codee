import type { ToolCall } from '../../lib/types';
import style from './ToolsContainer.module.css';
import { BsChevronDown, BsX } from 'react-icons/bs';

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
                        <p>{lastToolCall ? `${lastToolCall.tool_name}(${JSON.stringify(lastToolCall.arguments, null, 2)})` : 'Setting up sandbox...'}</p>
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
                        <span>
                            <strong>Codee-Sandbox % </strong>
                            {toolCall.tool_name}({toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && JSON.stringify(toolCall.arguments)})
                        </span>
                        {toolCall.duration_ms && (
                            <span>
                                {toolCall.duration_ms}
                                ms
                            </span>
                        )}
                    </div>
                    {toolCall.result && (
                        <div className={style.toolCallResult}>
                            {typeof toolCall.result === 'object' ? JSON.stringify(toolCall.result, null, 2) : toolCall.result}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
