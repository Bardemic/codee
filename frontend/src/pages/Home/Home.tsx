import { useGetUserInfoQuery } from '../../app/services/auth/authService';
import { RepositoriesPill } from '../../features/repositories/RepositoriesPill'
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type {Repository} from "../../app/services/integrations/integrationsService";
import { useGetWorkspacesQuery, useNewMessageMutation } from '../../app/services/workspaces/workspacesService';
import { BsSend } from 'react-icons/bs';
import styles from './home.module.css'

function Home() {
    const [selected, setSelected] = useState<Repository | null>(null)
    const navigate = useNavigate();
    const [userMessage, setUserMessage] = useState("");
    const [newMessage] = useNewMessageMutation();
    const { data: user, isLoading } = useGetUserInfoQuery();
    const { data: workspaces } = useGetWorkspacesQuery();

    async function sendNewMessage() {
        const r = await newMessage({message: userMessage, repository_name: selected?.name || ""}).unwrap();
        if (r.workspace_id) navigate(`/workspace/${r.workspace_id}`)
    }

    useEffect(() => {
        if (!isLoading && !user) {
            navigate("/login");
        }
    }, [isLoading, user, navigate]);
    return (
        <div>
            <h1>Welcome, {user && user.email}</h1>
            <div className={styles.chatContainer}>
                <textarea onKeyDown={(e) => { if (e.key === 'Enter' && userMessage.length > 0) { e.preventDefault(); sendNewMessage(); } }} value={userMessage} onChange={(e) => setUserMessage(e.target.value)} className={styles.newWorkspace} placeholder='Find all errors from the recent commit and fix them' name="prompt" id="6-7" />
                {userMessage.length > 0 && <button className={styles.sendButton} onClick={sendNewMessage}><BsSend size={16} /></button>}
                <RepositoriesPill selected={selected} setSelected={setSelected}/>
            </div>
            <div className={styles.workspacesContainer}>
                {workspaces?.map((workspace) => (
                    <div className={styles.workspace} key={workspace.id}>
                        <a href={`workspace/${workspace.id}`}></a>{workspace.name}
                    </div>
                ))}
            </div>
        </div>
    )
}

export default Home