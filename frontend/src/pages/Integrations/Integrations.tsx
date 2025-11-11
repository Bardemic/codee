import styles from './integrations.module.css';
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useAddIntegrationMutation, useDeleteIntegrationMutation, useGetIntegrationsQuery } from "../../app/services/integrations/integrationsService";
import IntegrationCard from "./IntegrationCard";

export default function Integrations() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [addIntegration] = useAddIntegrationMutation();
    const [deleteIntegration] = useDeleteIntegrationMutation();
    const { data: integrations } = useGetIntegrationsQuery();

    useEffect(() => {
        const callback = searchParams.get('callback');
        if (!callback) return;

        const stateKey = searchParams.get("state");
        const localKey = sessionStorage.getItem("curKey");
        if (!stateKey || stateKey !== localKey) return;

        const installationId = searchParams.get("installation_id");
        if (!installationId) return;

        addIntegration({
            type: "github",
            data: { installation_id: installationId }
        })
        .unwrap()
        .then(() => {
            sessionStorage.removeItem("curKey");
            navigate("/integrations/");
        })
        .catch(() => {sessionStorage.removeItem("curKey");});
    }, [searchParams, addIntegration, navigate])

    function openIntegration() { //need a better solution later, for github for now #techdebt
        const key = Math.random().toString();
        sessionStorage.setItem("curKey", key);
        window.open(`https://github.com/apps/codee-local/installations/new?state=${key}&redirect_url=http://localhost:5173/integrations?callback=github`, '_blank');
    }

    function deleteUserIntegration(id: number) {
        deleteIntegration(id);
    }
    return (
        <div>
            <h1>
                Integrations
            </h1>
            <div className={styles.integrationsContainer}>
                {integrations?.map((integration) => (
                        <IntegrationCard key={integration.id} integration={integration} onOpen={openIntegration} onDelete={deleteUserIntegration}  />
                ))}
            </div>
        </div>
    )
}