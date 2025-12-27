import styles from './styles.module.css';

interface PromptSectionProps {
    prompt: string;
    setPrompt: (prompt: string) => void;
}

export function PromptSection({ prompt, setPrompt }: PromptSectionProps) {
    return (
        <div className={styles.promptWrapper}>
            <div className={styles.toolsHeader}>Prompt</div>
            <textarea className={styles.modalTextarea} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Enter worker prompt..." />
        </div>
    );
}
