import type { Integration } from '../../app/services/integrations/integrationsService'
import styles from './integrations.module.css'

interface IntegrationCardProps {
    integration: Integration
    onDelete: (cal: number) => void
    onOpen: () => void
}

export default function IntegrationCard(props: IntegrationCardProps) {
    const iconName = props.integration.name.toLowerCase().replace(/\s+/g, '-')
    const iconSrc = import.meta.glob('../../assets/svgs/*.svg', { eager: true, as: 'url' })[`../../assets/svgs/${iconName}.svg`]
    return (
        <div className={styles.integration}>
            <div className={styles.iconContainer}>
                <img className={styles.icon} src={iconSrc} alt={props.integration.name} />
                {props.integration.name}
            </div>
            {props.integration.connection_id ? (
                <div className={styles.connected}>
                    <button onClick={() => {props.onDelete(props.integration.connection_id!)}}>Delete connection</button><p>Connected</p>
                </div>
            ) : <button onClick={props.onOpen}>Connect</button>}
        </div>
    )
}