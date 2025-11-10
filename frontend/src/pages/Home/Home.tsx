import { useGetUserInfoQuery } from '../../app/services/auth/authService';
import { RepositoriesPill } from '../../features/repositories/RepositoriesPill'

function Home() {
    const { data: user } = useGetUserInfoQuery();
    console.log(user)
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