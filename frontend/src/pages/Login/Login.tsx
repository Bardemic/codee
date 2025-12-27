import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, useSession } from '../../lib/auth';
import styles from './auth.module.css';

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { data: session } = useSession();

    useEffect(() => {
        if (session?.user) navigate('/');
    }, [navigate, session]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setIsLoading(true);

        const result = await signIn.email({ email, password });

        setIsLoading(false);

        if (result.error) {
            setError(result.error.message || 'Login failed');
            return;
        }

        navigate('/');
    }

    return (
        <form className={styles.container} onSubmit={handleSubmit}>
            <h2>Login</h2>
            {error && <p className={styles.error}>{error}</p>}
            <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="Email"
                autoComplete="email"
                disabled={isLoading}
            />
            <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                disabled={isLoading}
            />
            <button type="submit" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Submit'}
            </button>
        </form>
    );
}

export default Login;
