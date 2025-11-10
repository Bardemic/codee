import { useEffect, useState } from "react"
import { useAppDispatch } from "../../app/hooks";
import { loginUser } from '../../features/auth/authSlice';
import { useNavigate } from "react-router-dom";
import { authApi } from "../../app/services/auth/authService";

function Login() {
    const [email, setEmail] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const dispatch = useAppDispatch();
    const navigate = useNavigate();

    useEffect(() => {
        const token = localStorage.getItem('userToken');
        if (token) navigate('/');
    }, [navigate]);

    async function handleSubmit() {
        try {
            await dispatch(loginUser({email, password})).unwrap();
            dispatch(authApi.util.resetApiState());
            navigate("/");
        } catch { return; }
    }
  

    return (
        <div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="text" name="" id="v" placeholder='email'/>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" name="" id="a" placeholder='pw'/>
            <button onClick={handleSubmit}>
                submit
            </button>
        </div>
    )
}

export default Login