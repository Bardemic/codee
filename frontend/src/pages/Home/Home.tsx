import { useGetUserInfoQuery } from '../../app/services/auth/authService';
import { RepositoriesPill } from '../../features/repositories/RepositoriesPill'
import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useGetIntegrationsQuery, type Repository } from "../../app/services/integrations/integrationsService";
import { useNewWorkspaceMutation } from '../../app/services/workspaces/workspacesService';
import { BsSend } from 'react-icons/bs';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import styles from './home.module.css';
import { PromptEditor, type PromptEditorRef } from './components/PromptEditor';
import { ToolsSelector } from './components/ToolsSelector';

export type SelectedTools = Record<string, string[]>;

function Home() {
    const [selected, setSelected] = useState<Repository | null>(null);
    const [selectedTools, setSelectedTools] = useState<SelectedTools>({});
    const editorRef = useRef<PromptEditorRef>(null);
    const navigate = useNavigate();
    const [newWorkspace, { isLoading: isCreatingWorkspace }] = useNewWorkspaceMutation();
    const { data: user, isLoading } = useGetUserInfoQuery();
    const { data: integrations } = useGetIntegrationsQuery();

    async function createNewWorkspace(userMessage: string) {
        const r = await newWorkspace({message: userMessage, repository_name: selected?.name || ""}).unwrap();
        if (r.workspace_id) navigate(`/workspace/${r.workspace_id}`)
    }

    useEffect(() => {
        if (!isLoading && !user) {
            navigate("/login");
        }
    }, [isLoading, user, navigate]);
    return (
        <div className={styles.homeContainer}>
            <h1 className={styles.header}>say hi to <span className={styles.focusedHeader}>Codee</span>.</h1>
            <div className={styles.chatContainer}>
                <PromptEditor
                    ref={editorRef}
                    integrations={integrations ?? []}
                    onSelectedToolsChange={setSelectedTools}
                    onSubmit={createNewWorkspace}
                    disabled={isCreatingWorkspace}
                    placeholder='Find all errors from the recent commit and fix them'
                />

                <div className={styles.chatFooter}>
                    <div className={styles.pillsContainer}>
                        <RepositoriesPill selected={selected} setSelected={setSelected}/>
                        <ToolsSelector
                            integrations={integrations ?? []}
                            selectedTools={selectedTools}
                            onChange={setSelectedTools}
                        />
                    </div>
                    <button
                        className={styles.sendButton}
                        onClick={() => {
                            const message = editorRef.current?.getMessage().trim();
                            if (message) createNewWorkspace(message);
                        }}
                        disabled={isCreatingWorkspace}
                    >
                        {isCreatingWorkspace ? <AiOutlineLoading3Quarters size={16} className={styles.spinIcon} /> : <BsSend size={16} />}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default Home