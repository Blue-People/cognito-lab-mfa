import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaSession, setMfaSession] = useState(null);
  const [mfaUsername, setMfaUsername] = useState(null);
  const [mfaCode, setMfaCode] = useState('');

  const { login, verifyMFA } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);

      if (result.success) {
        if (result.requiresMFA) {
          // El username debe ser el hash que viene del backend, no el email
          const username = result.username;
          
          console.log('MFA required, saving:', { 
            session: result.session, 
            username: username,
            resultUsername: result.username,
            email: email,
            fullResult: result
          });
          
          if (!result.session) {
            setError('Error: No se recibió la sesión de MFA');
            return;
          }
          
          if (!username) {
            setError('Error: No se recibió el username hash del servidor');
            return;
          }
          
          // Guardar en localStorage como respaldo
          localStorage.setItem('mfaUsername', username);
          localStorage.setItem('mfaSession', result.session);
          
          setMfaRequired(true);
          setMfaSession(result.session);
          setMfaUsername(username); // Guardar el hash del username para MFA
          
          console.log('Username hash guardado:', username);
        } else {
          navigate('/dashboard');
        }
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleMFAVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    console.log('Verifying MFA with:', { 
      hasSession: !!mfaSession, 
      hasCode: !!mfaCode, 
      hasUsername: !!mfaUsername,
      username: mfaUsername 
    });

    // Usar el username hash guardado o del localStorage (NO usar el email como fallback)
    const usernameToUse = mfaUsername || localStorage.getItem('mfaUsername');
    
    // También recuperar la sesión del localStorage si se perdió
    const sessionToUse = mfaSession || localStorage.getItem('mfaSession');
    
    if (!usernameToUse) {
      setError('Error: Username hash no disponible. Por favor, inicia sesión nuevamente.');
      setLoading(false);
      return;
    }

    if (!sessionToUse) {
      setError('Error: Sesión no disponible. Por favor, inicia sesión nuevamente.');
      setLoading(false);
      return;
    }

    console.log('Verificando MFA con:', {
      username: usernameToUse,
      hasSession: !!sessionToUse,
      sessionSource: mfaSession ? 'state' : 'localStorage',
      usernameSource: mfaUsername ? 'state' : 'localStorage',
    });

    try {
      const result = await verifyMFA(sessionToUse, mfaCode, usernameToUse);
      
      // Limpiar localStorage después de verificación exitosa
      localStorage.removeItem('mfaUsername');
      localStorage.removeItem('mfaSession');

      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.error || 'MFA verification failed');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (mfaRequired) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2>Verificación MFA</h2>
          <p>Ingresa el código de 6 dígitos de tu aplicación autenticadora</p>
          <form onSubmit={handleMFAVerify}>
            <div className="form-group">
              <label>Código MFA</label>
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="000000"
                maxLength="6"
                required
                autoFocus
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" disabled={loading}>
              {loading ? 'Verificando...' : 'Verificar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Iniciar Sesión</h2>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@ejemplo.com"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>
        <p className="signup-link">
          ¿No tienes cuenta? <a href="/signup">Regístrate</a>
        </p>
      </div>
    </div>
  );
};

export default Login;

