import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import QRCode from 'qrcode.react';
import './Dashboard.css';

const Dashboard = () => {
  const { user, accessToken, logout } = useAuth();
  const navigate = useNavigate();
  const [mfaSecret, setMfaSecret] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    if (!accessToken) {
      navigate('/login');
    } else {
      // Verificar el estado del MFA al cargar
      checkMFAStatus();
    }
  }, [accessToken, navigate]);

  const checkMFAStatus = async () => {
    if (!accessToken) return;
    
    try {
      const result = await authService.getMFAStatus(accessToken);
      setMfaEnabled(result.mfaEnabled || false);
      
      // Actualizar información del usuario desde los atributos
      if (result.userAttributes && result.userAttributes.length > 0) {
        const userData = {};
        result.userAttributes.forEach((attr) => {
          userData[attr.Name] = attr.Value;
        });
        setUserInfo(userData);
      }
    } catch (err) {
      console.error('Error checking MFA status:', err);
      // No mostrar error, solo no establecer el estado
    }
  };

  const handleSetupMFA = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await authService.setupMFA(accessToken);
      setMfaSecret(result.secretCode);
    } catch (err) {
      setError(err.message || 'Error al configurar MFA');
    } finally {
      setLoading(false);
    }
  };

  const handleEnableMFA = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await authService.enableMFA(accessToken, mfaCode);
      setMfaSecret(null);
      setMfaCode('');
      setSuccess('MFA habilitado exitosamente');
      // Verificar el estado actualizado del MFA
      await checkMFAStatus();
    } catch (err) {
      setError(err.message || 'Código MFA inválido');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableMFA = async () => {
    if (!window.confirm('¿Estás seguro de que deseas desactivar MFA? Esto reducirá la seguridad de tu cuenta.')) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await authService.disableMFA(accessToken);
      setSuccess('MFA desactivado exitosamente');
      // Verificar el estado actualizado del MFA
      await checkMFAStatus();
    } catch (err) {
      setError(err.message || 'Error al desactivar MFA');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!accessToken) {
    return null;
  }

  return (
    <div className="dashboard-container">
      <nav className="dashboard-navbar">
        <div className="navbar-content">
          <h1>Dashboard</h1>
          <p className="welcome-text">Bienvenido, {user?.name || user?.email}</p>
        </div>
        <button onClick={handleLogout} className="logout-btn">
          Cerrar Sesión
        </button>
      </nav>

      <div className="dashboard-content">
        <div className="info-card">
          <h2>Información del Usuario</h2>
          <div className="info-details">
            <div className="info-item">
              <span className="info-label">Email:</span>
              <span className="info-value">
                {userInfo?.email || user?.email || userInfo?.Email || user?.Email || 'N/A'}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Nombre:</span>
              <span className="info-value">
                {userInfo?.name || user?.name || userInfo?.Name || user?.Name || 
                 userInfo?.['custom:name'] || user?.['custom:name'] || 'N/A'}
              </span>
            </div>
            {(userInfo?.sub || user?.sub) && (
              <div className="info-item">
                <span className="info-label">ID de Usuario:</span>
                <span className="info-value">{userInfo?.sub || user?.sub}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mfa-card">
          <h2>Autenticación de Dos Factores (MFA)</h2>
          {!mfaSecret && !mfaEnabled && (
            <div className="mfa-prompt">
              <p>Habilita MFA para mayor seguridad en tu cuenta.</p>
              <button onClick={handleSetupMFA} disabled={loading} className="primary-btn">
                {loading ? 'Configurando...' : 'Configurar MFA'}
              </button>
            </div>
          )}

          {mfaSecret && (
            <div className="mfa-setup">
              <p className="setup-instructions">Escanea este código QR con tu aplicación autenticadora:</p>
              <div className="qr-container">
                <QRCode value={`otpauth://totp/${user?.email}?secret=${mfaSecret}&issuer=CognitoMFA`} />
              </div>
              <p className="secret-code">Código secreto: <code>{mfaSecret}</code></p>
              <form onSubmit={handleEnableMFA}>
                <div className="form-group">
                  <label>Ingresa el código de 6 dígitos para verificar:</label>
                  <input
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="000000"
                    maxLength="6"
                    required
                  />
                </div>
                <button type="submit" disabled={loading} className="primary-btn">
                  {loading ? 'Habilitando...' : 'Habilitar MFA'}
                </button>
              </form>
            </div>
          )}

          {mfaEnabled && (
            <div className="mfa-enabled">
              <p>MFA está habilitado en tu cuenta</p>
              <button 
                onClick={handleDisableMFA} 
                disabled={loading} 
                className="disable-mfa-btn"
              >
                {loading ? 'Desactivando...' : 'Desactivar MFA'}
              </button>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

