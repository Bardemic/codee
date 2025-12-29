import { RepositoriesPill, SelectionPill } from '../../features/repositories/RepositoriesPill';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { trpc } from '../../lib/trpc';
import { useSession } from '../../lib/auth';
import type { Repository } from '../../lib/types';
import styles from './home.module.css';
import { ChatBox } from './components/ChatBox';
import type { CloudAgentsSelection } from './components/CloudAgentsDropdown';
import { FiGitBranch } from 'react-icons/fi';

function Home() {
    const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
    const [cloudAgents, setCloudAgents] = useState<CloudAgentsSelection>({
        providers: [{ agents: [{ model: 'auto.5', tools: [] }], name: 'Codee' }],
    });

    const selectRepository = (repo: Repository) => {
        setSelectedRepo(repo);
        setSelectedBranch(repo.default_branch);
    };

    const navigate = useNavigate();
    const utils = trpc.useUtils();

    const { data: branches } = trpc.integrations.branches.useQuery(
        { repository_full_name: selectedRepo?.name ?? '' },
        { enabled: !!selectedRepo, trpc: { context: { skipBatch: true } } }
    );

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

    const activeProviders = useMemo(
        () =>
            cloudAgents.providers
                .filter((provider) => provider.agents.length > 0)
                .map((provider) => ({
                    name: provider.name,
                    agents: provider.agents.map((agent) => ({ model: agent.model })),
                })),
        [cloudAgents]
    );

    const branchOptions = useMemo(() => {
        const branchNames = branches?.map((branch) => branch.name) ?? [];
        const defaultBranch = selectedRepo?.default_branch;

        if (defaultBranch && !branchNames.includes(defaultBranch)) {
            branchNames.unshift(defaultBranch);
        }

        return branchNames.map((name) => ({ id: name, label: name, value: name }));
    }, [branches, selectedRepo?.default_branch]);

    const selectedBranchOption = useMemo(() => {
        if (!selectedBranch) return null;
        return (
            branchOptions.find((option) => option.value === selectedBranch) ?? {
                id: selectedBranch,
                label: selectedBranch,
                value: selectedBranch,
            }
        );
    }, [branchOptions, selectedBranch]);

    async function createNewWorkspace(userMessage: string, selectedTools: string[]) {
        if (!selectedRepo || !selectedBranch) return;
        await createWorkspace.mutateAsync({
            message: userMessage,
            repository_full_name: selectedRepo.name,
            branch_name: selectedBranch,
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
                    isDisabled={!selectedBranch}
                    placeholder="Find all errors from the recent commit and fix them"
                    leftPills={
                        <>
                            <RepositoriesPill selected={selectedRepo} setSelected={selectRepository} />
                            <SelectionPill
                                options={branchOptions}
                                selected={selectedBranchOption}
                                onSelect={(option) => setSelectedBranch(option.value)}
                                placeholder="Select branch"
                                icon={<FiGitBranch size={14} />}
                            />
                        </>
                    }
                />
            </div>
        </div>
    );
}

export default Home;
