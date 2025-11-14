import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAppDispatch } from "../../app/hooks";
import { loginUser } from "../../features/auth/authSlice";
import { useNavigate } from "react-router-dom";
import { authApi, useGetUserInfoQuery } from "../../app/services/auth/authService";
import styles from "./auth.module.css";

function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const { data: user } = useGetUserInfoQuery();

    useEffect(() => {
        if (user) navigate("/");
    }, [navigate, user]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        try {
            await dispatch(loginUser({ email, password })).unwrap();
            dispatch(authApi.util.resetApiState());
            navigate("/");
        } catch {
            return;
        }
    }

    return (
        <form className={styles.container} onSubmit={handleSubmit}>
            <h2>
                Login
            </h2>
            <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="Email"
                autoComplete="email"
            />
            <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="Password"
                autoComplete="current-password"
            />
            <button type="submit">Submit</button>
        </form>
    );
}

export default Login;