import { useGetUserInfoQuery } from '../../app/services/auth/authService';
import { RepositoriesPill } from '../../features/repositories/RepositoriesPill'
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

function Home() {
    const navigate = useNavigate();
    const { data: user, isLoading } = useGetUserInfoQuery(undefined, { refetchOnMountOrArgChange: true });

    useEffect(() => {
        if (!isLoading && !user) {
            navigate("/login");
        }
    }, [isLoading, user, navigate]);
    return (
        <div>
            <div className='text-area-container'>
                <h1>Welcome, {user && user.email}</h1>
                <textarea className='new-message' placeholder='Find all errors from the recent commit and fix them' name="prompt" id="6-7" />
                <RepositoriesPill />
            </div>
        </div>
    )
}

export default Home