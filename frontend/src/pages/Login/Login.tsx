import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/useAuth';
import styles from './auth.module.css';

function Login() {
    const navigate = useNavigate();
    const { user, loading } = useAuth();

    const BACKEND_URL = 'https://sb-2zgoradkpon5.vercel.run';

    useEffect(() => {
        if (!loading && user) {
            navigate('/');
        }
    }, [loading, user, navigate]);

    return (
        <div className={styles.container}>
            <h2>Sign in to Codee</h2>
            <button onClick={() => (window.location.href = `${BACKEND_URL}/api/auth/login`)} className={styles.submitButton}>
                Sign in with Email
            </button>
        </div>
    );
}

export default Login;
