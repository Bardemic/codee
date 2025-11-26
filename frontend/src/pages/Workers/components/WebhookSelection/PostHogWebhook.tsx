import { FaCopy } from 'react-icons/fa';
import styles from './styles.module.css';

interface Props {
    slug: string;
}

export function PostHogWebhook({ slug }: Props) {
    const jsonSnippet = JSON.stringify({ worker_slug: slug, event: "{event.properties}", repository: "name/repository", key: "testing" }, null, 2);

    const handleCopy = () => {
        navigator.clipboard.writeText(jsonSnippet);
    };
    
    return (
        <div className={styles.container}>
            <p className={styles.text}>
                Integrate your worker with PostHog to automatically trigger actions based on events. 
                This setup ensures seamless data flow between your analytics and worker processes. 
                Simply copy the configuration below to get started immediately.
            </p>
            <div className={styles.codeBlock}>
                <pre>{jsonSnippet}</pre>
                <button 
                    className={styles.copyButton} 
                    onClick={handleCopy}
                    aria-label="Copy to clipboard"
                    title="Copy to clipboard"
                >
                    <FaCopy size={16} />
                </button>
            </div>
        </div>
    );
}

