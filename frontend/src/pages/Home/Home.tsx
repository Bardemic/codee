import { RepositoriesPill, SelectionPill } from '../../features/repositories/RepositoriesPill';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { trpc } from '../../lib/trpc';
import { useSession } from '../../lib/auth';
import type { Repository, MessageImage } from '../../lib/types';
import styles from './home.module.css';
import { ChatBox } from './components/ChatBox';
import type { CloudAgentsSelection } from './components/CloudAgentsDropdown';
import { FiGitBranch } from 'react-icons/fi';

function Home() {
    const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
    const [subAgents, setSubAgents] = useState<boolean>(false);
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

    async function createNewWorkspace(userMessage: string, selectedTools: string[], images: MessageImage[]) {
        if (!selectedRepo || !selectedBranch) return;
        await createWorkspace.mutateAsync({
            message: userMessage,
            repository_full_name: selectedRepo.name,
            branch_name: selectedBranch,
            tool_slugs: selectedTools,
            cloud_providers: activeProviders,
            sub_agents: subAgents,
            images,
        });
    }

    useEffect(() => {
        if (!isPending && !session?.user) {
            navigate('/login');
        }
    }, [isPending, session, navigate]);

    const recentActivity = [
        { title: 'Fix bugs in auth service', status: 'Completed', statusTone: 'success', time: '2h ago' },
        { title: 'Refactor data fetching', status: 'In Progress', statusTone: 'info', time: '4h ago' },
        { title: 'Deploy to staging', status: 'Completed', statusTone: 'success', time: 'Yesterday' },
    ] as const;

    return (
        <div className={styles.homeContainer}>
            <div className={styles.contentWrap}>
                <h1 className={styles.header}>New Task</h1>
                <div className={styles.chatContainer}>
                    <ChatBox
                        integrations={integrations ?? []}
                        cloudAgents={cloudAgents}
                        onCloudAgentsChange={setCloudAgents}
                        onSubmit={createNewWorkspace}
                        isLoading={createWorkspace.isPending}
                        isDisabled={!selectedBranch}
                        placeholder="Describe your coding task..."
                        subAgents={subAgents}
                        onSubAgentsChange={setSubAgents}
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
                <div className={styles.activitySection}>
                    <h2 className={styles.sectionTitle}>Recent Activity</h2>
                    <div className={styles.activityList}>
                        {recentActivity.map((item) => (
                            <div key={item.title} className={styles.activityRow}>
                                <div className={styles.activityInfo}>
                                    <span className={styles.activityTitle}>{item.title}</span>
                                </div>
                                <div className={`${styles.activityStatus} ${styles[`status${item.statusTone}`]}`}>
                                    {item.status}
                                </div>
                                <span className={styles.activityTime}>{item.time}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Home;
