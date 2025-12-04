import { useState, FormEvent, useEffect } from "react";
import { registerUser } from '../../features/auth/authSlice';
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { useNavigate } from 'react-router-dom';
import { getAuthStatus } from '../../features/auth/authSlice';

function Register() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const status = useAppSelector(getAuthStatus);

  useEffect(() => {
    // clear local errors when user starts typing
    if (localError && (email || password)) setLocalError(null);
  }, [email, password, localError]);

  function validate() {
    if (!email) return "Please enter an email.";
    // simple email check
    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(email)) return "Please enter a valid email.";
    if (!password) return "Please enter a password.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setLocalError(v);
      return;
    }

    try {
      // await the async thunk and navigate to login on success
      await dispatch(registerUser({ email, password })).unwrap();
      navigate('/login');
    } catch (err) {
      // show a friendly message; the slice will also set error in state
      setLocalError('Registration failed. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320}}>
      <h2>Sign up</h2>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="Email"
        autoComplete="email"
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        placeholder="Password (min 8 chars)"
        autoComplete="new-password"
      />

      {localError && (
        <div style={{ color: 'red' }}>{localError}</div>
      )}

      <button type="submit" disabled={status === 'pending'}>
        {status === 'pending' ? 'Creating...' : 'Create account'}
      </button>
    </form>
  );
}

export default Register;
