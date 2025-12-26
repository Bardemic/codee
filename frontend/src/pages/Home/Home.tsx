import { RepositoriesPill } from '../../features/repositories/RepositoriesPill';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { trpc } from '../../lib/trpc';
import { useSession } from '../../lib/auth';
import type { Repository } from '../../lib/types';
import styles from './home.module.css';
import { ChatBox } from './components/ChatBox';
import type { CloudAgentsSelection } from './components/CloudAgentsDropdown';

function Home() {
    const [selected, setSelected] = useState<Repository | null>(null);
    const [cloudAgents, setCloudAgents] = useState<CloudAgentsSelection>({
        providers: [
            {
                agents: [{ model: 'auto.5', tools: [] }],
                name: 'Codee',
            },
        ],
    });
    const navigate = useNavigate();
    const utils = trpc.useUtils();
    const createWorkspace = trpc.workspace.create.useMutation({
        onSuccess: async (result) => {
            await utils.workspace.list.invalidate();
            if (result.agent_id) {
                navigate(`/agent/${result.agent_id}`);
            }
        },
    });
    const { data: session, isPending } = useSession();
    const { data: integrations } = trpc.integrations.list.useQuery();

    const activeProviders = useMemo(() => {
        return cloudAgents.providers
            .filter((provider) => provider.agents.length > 0)
            .map((provider) => ({
                name: provider.name,
                agents: provider.agents.map((agent) => ({
                    model: agent.model,
                })),
            }));
    }, [cloudAgents]);

    async function createNewWorkspace(userMessage: string, selectedTools: string[]) {
        await createWorkspace.mutateAsync({
            message: userMessage,
            repository_full_name: selected?.name || '',
            tool_slugs: selectedTools,
            cloud_providers: activeProviders,
        });
    }

    useEffect(() => {
        if (!isPending && !session?.user) {
            navigate('/login');
        }
    }, [isPending, session, navigate]);

    return (
        <div className={styles.homeContainer}>
            <h1 className={styles.header}>
                say hi to <span className={styles.focusedHeader}>Codee</span>.
            </h1>
            <div className={styles.chatContainer}>
                <ChatBox
                    integrations={integrations ?? []}
                    cloudAgents={cloudAgents}
                    onCloudAgentsChange={setCloudAgents}
                    onSubmit={createNewWorkspace}
                    isLoading={createWorkspace.isPending}
                    placeholder="Find all errors from the recent commit and fix them"
                    leftPills={<RepositoriesPill selected={selected} setSelected={setSelected} />}
                />
            </div>
        </div>
    );
}

export default Home;
