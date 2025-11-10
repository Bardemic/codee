import { useState } from "react"
import { registerUser } from '../../features/auth/authSlice';
import { useAppDispatch } from "../../app/hooks";

function Register() {
    const [email, setEmail] = useState<string>("")
  const [password, setPassword] = useState<string>("")
  const dispatch = useAppDispatch()
  

  return (
    <div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="text" name="" id="v" placeholder='email'/>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" name="" id="a" placeholder='pw'/>
        <button onClick={() => {dispatch(registerUser({email, password}))}}>
            submit
        </button>
    </div>
  )
}

export default Register