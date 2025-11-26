import styles from './styles.module.css';

interface Props {
    slug: string;
}

export function PostHogWebhook({ slug }: Props) {
    const jsonSnippet = JSON.stringify({ slug, repository: "full_name" }, null, 2);
    
    return (
        <div className={styles.container}>
            <p className={styles.text}>
                Integrate your worker with PostHog to automatically trigger actions based on events. 
                This setup ensures seamless data flow between your analytics and worker processes. 
                Simply copy the configuration below to get started immediately.
            </p>
            <div className={styles.codeBlock}>
                <pre>{jsonSnippet}</pre>
            </div>
        </div>
    );
}

