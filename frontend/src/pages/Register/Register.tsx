import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { signUp, useSession } from '../../lib/auth';
import styles from '../Login/auth.module.css';

function Register() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
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

        const result = await signUp.email({
            email,
            password,
            name: name || email,
        });

        setIsLoading(false);

        if (result.error) {
            setError(result.error.message || 'Registration failed');
            return;
        }

        navigate('/');
    }

    return (
        <form className={styles.container} onSubmit={handleSubmit}>
            <h2>Register</h2>
            {error && <p className={styles.error}>{error}</p>}
            <input value={name} onChange={(event) => setName(event.target.value)} type="text" placeholder="Name" autoComplete="name" disabled={isLoading} />
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
                autoComplete="new-password"
                disabled={isLoading}
            />
            <button type="submit" disabled={isLoading}>
                {isLoading ? 'Creating account...' : 'Submit'}
            </button>
        </form>
    );
}

export default Register;
