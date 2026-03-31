import type { ChangeEvent, MouseEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

type LoginResponse = {
  id: number;
  firstName: string;
  lastName: string;
  error: string;
};

function Login() {
  const [message, setMessage] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setPassword] = useState('');
  const navigate = useNavigate();

  function handleSetLoginName(event: ChangeEvent<HTMLInputElement>): void {
    setLoginName(event.target.value);
  }

  function handleSetPassword(event: ChangeEvent<HTMLInputElement>): void {
    setPassword(event.target.value);
  }

  async function doLogin(event: MouseEvent<HTMLInputElement>): Promise<void> {
    event.preventDefault();

    const payload = JSON.stringify({
      login: loginName,
      password: loginPassword,
    });

    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
      });

      const res: LoginResponse = await response.json();

      if (res.id <= 0) {
        setMessage(res.error || 'User/Password combination incorrect');
        return;
      }

      const user = {
        firstName: res.firstName,
        lastName: res.lastName,
        id: res.id,
      };

      localStorage.setItem('user_data', JSON.stringify(user));
      setMessage('');
      navigate('/cards');
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : 'Unable to contact the server';
      setMessage(fallback);
    }
  }

  return (
    <div id="loginDiv">
      <span id="inner-title">LOG IN</span>
      <br />
      <input
        type="text"
        id="loginName"
        placeholder="Username"
        value={loginName}
        onChange={handleSetLoginName}
      />
      <br />
      <input
        type="password"
        id="loginPassword"
        placeholder="Password"
        value={loginPassword}
        onChange={handleSetPassword}
      />
      <br />
      <input
        type="submit"
        id="loginButton"
        className="buttons"
        value="Login"
        onClick={doLogin}
      />
      <span id="loginResult">{message}</span>
    </div>
  );
}

export default Login;
