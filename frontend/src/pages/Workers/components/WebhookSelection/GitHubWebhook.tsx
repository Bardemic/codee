import styles from './styles.module.css';

interface GitHubWebhookProps {
    slug: string;
}

export function GitHubWebhook({ slug }: GitHubWebhookProps) {
    return (
        <div className={styles.container}>
            <p className={styles.text}>
                In the comments of an issue, describe what you want codee to do for additional context, then include this in the comment
            </p>
            <div className={styles.codeBlock}>
                <pre>{`--codee/${slug}`}</pre>
            </div>
        </div>
    );
}
