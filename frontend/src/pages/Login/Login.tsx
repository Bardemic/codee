import { useState } from "react"
import { useAppDispatch } from "../../app/hooks";
import { loginUser } from '../../features/auth/authSlice';
import { useNavigate } from "react-router-dom";
import { useGetUserInfoQuery } from "../../app/services/auth/authService";

function Login() {
    const [email, setEmail] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const { data: user } = useGetUserInfoQuery();
    if (user) navigate('/')

    function handleSubmit() {
        try {
            dispatch(loginUser({email, password}));
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