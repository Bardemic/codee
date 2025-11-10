import { FaSquareGithub } from "react-icons/fa6"
import styles from './integrations.module.css'

export default function Integrations() {
    return (
        <div>
            <h1>
                Integrations
            </h1>
            <div className={styles.integrationsContainer}>
                <div className={styles.integration}>
                    <div className={styles.iconContainer}>
                        <FaSquareGithub size={48} /> Github
                    </div>
                    <button>
                        Connect
                    </button>
                </div>
            </div>
        </div>
    )
}