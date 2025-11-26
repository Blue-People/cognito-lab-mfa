import { CognitoUser, AuthenticationDetails, CognitoUserPool } from 'amazon-cognito-identity-js';
import { awsConfig } from '../config/aws-config';

const userPool = new CognitoUserPool({
  UserPoolId: awsConfig.userPoolId,
  ClientId: awsConfig.userPoolWebClientId,
});

export const authService = {
  signUp: async (email, password, name) => {
    try {
      const response = await fetch(`${awsConfig.apiEndpoint}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }
      return data;
    } catch (error) {
      throw error;
    }
  },

  login: async (email, password) => {
    try {
      const response = await fetch(`${awsConfig.apiEndpoint}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }
      return data;
    } catch (error) {
      throw error;
    }
  },

  verifyMFA: async (session, code, username) => {
    try {
      // Validar que el username esté presente
      if (!username || username.trim() === '') {
        throw new Error('Username is required for MFA verification');
      }

      const requestBody = { 
        session: session?.trim(), 
        code: code?.toString().trim(), 
        username: username.trim() 
      };
      
      console.log('Sending MFA verification request:', {
        hasSession: !!requestBody.session,
        hasCode: !!requestBody.code,
        hasUsername: !!requestBody.username,
        username: requestBody.username,
        requestBody: requestBody,
      });

      // Validar que todos los campos estén presentes
      if (!requestBody.session || !requestBody.code || !requestBody.username) {
        throw new Error('Missing required fields: session, code, or username');
      }

      const response = await fetch(`${awsConfig.apiEndpoint}/auth/verify-mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('MFA verification failed:', data);
        throw new Error(data.error || `MFA verification failed: ${data.errorName || 'Unknown error'}`);
      }
      return data;
    } catch (error) {
      throw error;
    }
  },

  setupMFA: async (accessToken) => {
    try {
      const response = await fetch(`${awsConfig.apiEndpoint}/auth/setup-mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'MFA setup failed');
      }
      return data;
    } catch (error) {
      throw error;
    }
  },

  enableMFA: async (accessToken, code) => {
    try {
      const response = await fetch(`${awsConfig.apiEndpoint}/auth/enable-mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Enable MFA failed');
      }
      return data;
    } catch (error) {
      throw error;
    }
  },

  getMFAStatus: async (accessToken) => {
    try {
      const response = await fetch(`${awsConfig.apiEndpoint}/auth/mfa-status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Get MFA status failed');
      }
      return data;
    } catch (error) {
      throw error;
    }
  },

  disableMFA: async (accessToken) => {
    try {
      const response = await fetch(`${awsConfig.apiEndpoint}/auth/disable-mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Disable MFA failed');
      }
      return data;
    } catch (error) {
      throw error;
    }
  },

  getCurrentUser: () => {
    return userPool.getCurrentUser();
  },

  getSession: async () => {
    const user = userPool.getCurrentUser();
    if (!user) {
      return null;
    }

    return new Promise((resolve, reject) => {
      user.getSession((err, session) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(session);
      });
    });
  },

  logout: () => {
    const user = userPool.getCurrentUser();
    if (user) {
      user.signOut();
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('idToken');
    localStorage.removeItem('refreshToken');
  },

  getAccessToken: async () => {
    try {
      const session = await authService.getSession();
      if (!session) {
        return null;
      }
      return session.getIdToken().getJwtToken();
    } catch (error) {
      return null;
    }
  },

  callProtectedAPI: async () => {
    try {
      const accessToken = await authService.getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${awsConfig.apiEndpoint}/api/protected`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'API call failed');
      }
      return data;
    } catch (error) {
      throw error;
    }
  },
};

