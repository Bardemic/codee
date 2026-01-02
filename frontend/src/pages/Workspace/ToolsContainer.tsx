import type { ToolCall } from '../../lib/types';
import style from './workspace.module.css';

export default function ToolsContainer({ toolCalls }: { toolCalls: ToolCall[] }) {
    return (
        <div className={style.toolCallStack}>
            {toolCalls.map((toolCall) => (
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
    );
}
