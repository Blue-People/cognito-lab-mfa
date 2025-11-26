import React, { createContext, useState, useEffect, useContext } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await authService.getAccessToken();
      if (token) {
        setAccessToken(token);
        const currentUser = authService.getCurrentUser();
        if (currentUser) {
          currentUser.getUserAttributes((err, attributes) => {
            if (!err) {
              const userData = {};
              attributes.forEach((attr) => {
                userData[attr.Name] = attr.Value;
              });
              setUser(userData);
            }
          });
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email, password, name) => {
    try {
      await authService.signUp(email, password, name);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const login = async (email, password) => {
    try {
      const result = await authService.login(email, password);
      
      if (result.challengeName === 'SOFTWARE_TOKEN_MFA') {
        // El username debe ser el hash que viene del backend, no el email
        if (!result.username) {
          throw new Error('Username hash not received from server');
        }
        return {
          success: true,
          requiresMFA: true,
          session: result.session,
          username: result.username, // Usar el hash del username, no el email
        };
      }

      // Store tokens
      if (result.accessToken) {
        setAccessToken(result.accessToken);
        localStorage.setItem('accessToken', result.accessToken);
        localStorage.setItem('idToken', result.idToken);
        localStorage.setItem('refreshToken', result.refreshToken);
        await checkAuth();
      }

      return { success: true, requiresMFA: false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const verifyMFA = async (session, code, username) => {
    try {
      const result = await authService.verifyMFA(session, code, username);
      
      if (result.accessToken) {
        setAccessToken(result.accessToken);
        localStorage.setItem('accessToken', result.accessToken);
        localStorage.setItem('idToken', result.idToken);
        localStorage.setItem('refreshToken', result.refreshToken);
        await checkAuth();
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setAccessToken(null);
  };

  const value = {
    user,
    accessToken,
    loading,
    signUp,
    login,
    verifyMFA,
    logout,
    isAuthenticated: !!accessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

