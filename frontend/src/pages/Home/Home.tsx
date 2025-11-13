import { useGetUserInfoQuery } from '../../app/services/auth/authService';
import { RepositoriesPill } from '../../features/repositories/RepositoriesPill'
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type {Repository} from "../../app/services/integrations/integrationsService";
import { useNewMessageMutation } from '../../app/services/workspaces/workspacesService';
import { BsSend } from 'react-icons/bs';
import styles from './home.module.css'

function Home() {
    const [selected, setSelected] = useState<Repository | null>(null)
    const navigate = useNavigate();
    const [userMessage, setUserMessage] = useState("");
    const [newMessage] = useNewMessageMutation();
    const { data: user, isLoading } = useGetUserInfoQuery();

    useEffect(() => {
        if (!isLoading && !user) {
            navigate("/login");
        }
    }, [isLoading, user, navigate]);
    return (
        <div>
            <div className='text-area-container'>
                <h1>Welcome, {user && user.email}</h1>
                <textarea value={userMessage} onChange={(e) => setUserMessage(e.target.value)} className='new-message' placeholder='Find all errors from the recent commit and fix them' name="prompt" id="6-7" >
                    
                </textarea>
                <button className={styles.sendButton} onClick={() => newMessage({message: userMessage, repository_name: selected?.name || ""})}><BsSend size={16} /></button>
                <RepositoriesPill selected={selected} setSelected={setSelected}/>
            </div>
        </div>
    )
}

export default Home