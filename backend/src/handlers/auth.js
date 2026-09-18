const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
const { createCognitoAuthService } = require('../services/cognitoAuth');
const { createResponse, parseBody, getAccessToken } = require('../utils/http');

const client = new CognitoIdentityProviderClient({ region: process.env.REGION });
const authService = createCognitoAuthService({
  client,
  userPoolId: process.env.USER_POOL_ID,
  clientId: process.env.CLIENT_ID,
});

/**
 * Maps Cognito authentication tokens to the public API contract.
 *
 * @param {object} authenticationResult Cognito authentication result.
 * @returns {{accessToken: string, refreshToken?: string, idToken: string, expiresIn: number}} Public token payload.
 */
const tokensFromResult = (authenticationResult) => ({
  accessToken: authenticationResult.AccessToken,
  refreshToken: authenticationResult.RefreshToken,
  idToken: authenticationResult.IdToken,
  expiresIn: authenticationResult.ExpiresIn,
});

/**
 * Returns an error message while preserving a safe fallback.
 *
 * @param {Error} error Caught application or provider error.
 * @param {string} fallback Default message.
 * @returns {string} Error message for the API response.
 */
const errorMessage = (error, fallback) => error.message || fallback;

/**
 * Registers a Cognito user.
 *
 * @param {object} event API Gateway/Lambda event.
 * @returns {Promise<object>} API Gateway-compatible response.
 */
module.exports.signup = async (event) => {
  try {
    const { email, password, name } = parseBody(event);
    if (!email || !password) return createResponse(400, { error: 'Email and password are required' });

    await authService.signUp({ email, password, name });
    return createResponse(200, { message: 'User created successfully', email });
  } catch (error) {
    console.error('Signup error:', error);
    return createResponse(500, { error: errorMessage(error, 'Error creating user') });
  }
};

/**
 * Initiates password login and returns either tokens or an MFA challenge.
 *
 * @param {object} event API Gateway/Lambda event.
 * @returns {Promise<object>} API Gateway-compatible response.
 */
module.exports.login = async (event) => {
  try {
    const { email, password } = parseBody(event);
    if (!email || !password) return createResponse(400, { error: 'Email and password are required' });

    const result = await authService.initiateLogin({ email, password });
    if (result.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
      return createResponse(200, {
        challengeName: result.ChallengeName,
        session: result.Session,
        username: result.ChallengeParameters?.USERNAME || email,
        message: 'MFA verification required',
      });
    }

    if (!result.AuthenticationResult) {
      return createResponse(500, { error: 'Authentication failed: No authentication result received' });
    }

    return createResponse(200, tokensFromResult(result.AuthenticationResult));
  } catch (error) {
    console.error('Login error:', error);
    return createResponse(401, { error: errorMessage(error, 'Invalid credentials') });
  }
};

/**
 * Completes login with a software-token MFA code.
 *
 * @param {object} event API Gateway/Lambda event.
 * @returns {Promise<object>} API Gateway-compatible response.
 */
module.exports.verifyMFA = async (event) => {
  try {
    const { session, code, username } = parseBody(event);
    if (!session || !code || !username?.trim()) {
      return createResponse(400, { error: 'Session, MFA code and username are required' });
    }

    const result = await authService.verifyMfa({
      session,
      code: String(code).trim(),
      username: username.trim(),
    });

    if (!result.AuthenticationResult) return createResponse(401, { error: 'Invalid MFA code' });
    return createResponse(200, tokensFromResult(result.AuthenticationResult));
  } catch (error) {
    console.error('MFA verification error:', error);
    const statusCode = ['NotAuthorizedException', 'CodeMismatchException'].includes(error.name) ? 401 : 500;
    return createResponse(statusCode, { error: errorMessage(error, 'Invalid MFA code') });
  }
};

/**
 * Creates a software-token secret for the authenticated user.
 *
 * @param {object} event API Gateway/Lambda event.
 * @returns {Promise<object>} API Gateway-compatible response.
 */
module.exports.setupMFA = async (event) => {
  try {
    const accessToken = getAccessToken(event);
    if (!accessToken) return createResponse(401, { error: 'Authorization token required' });

    const result = await authService.associateSoftwareToken(accessToken);
    return createResponse(200, {
      secretCode: result.SecretCode,
      message: 'Scan this QR code with your authenticator app',
    });
  } catch (error) {
    console.error('Setup MFA error:', error);
    const statusCode = error.name === 'NotAuthorizedException' ? 401 : error.name === 'InvalidParameterException' ? 400 : 500;
    return createResponse(statusCode, { error: errorMessage(error, 'Error setting up MFA') });
  }
};

/**
 * Verifies a TOTP code and enables MFA.
 *
 * @param {object} event API Gateway/Lambda event.
 * @returns {Promise<object>} API Gateway-compatible response.
 */
module.exports.enableMFA = async (event) => {
  try {
    const { code } = parseBody(event);
    const accessToken = getAccessToken(event);
    if (!accessToken || !code) return createResponse(400, { error: 'Authorization token and MFA code are required' });

    const result = await authService.enableMfa(accessToken, String(code).trim());
    if (result.Status !== 'SUCCESS') return createResponse(400, { error: 'Invalid MFA code' });
    return createResponse(200, { message: 'MFA enabled successfully' });
  } catch (error) {
    console.error('Enable MFA error:', error);
    return createResponse(500, { error: errorMessage(error, 'Error enabling MFA') });
  }
};

/**
 * Returns MFA configuration for the authenticated user.
 *
 * @param {object} event API Gateway/Lambda event.
 * @returns {Promise<object>} API Gateway-compatible response.
 */
module.exports.getMFAStatus = async (event) => {
  try {
    const accessToken = getAccessToken(event);
    if (!accessToken) return createResponse(401, { error: 'Authorization token required' });

    const user = await authService.getUser(accessToken);
    const mfaEnabled = user.MFAOptions?.some(option => option.DeliveryMedium === 'SOFTWARE_TOKEN') ||
      user.PreferredMfaSetting === 'SOFTWARE_TOKEN_MFA';

    return createResponse(200, {
      mfaEnabled: Boolean(mfaEnabled),
      preferredMfa: user.PreferredMfaSetting || null,
      mfaOptions: user.MFAOptions || [],
      userAttributes: user.UserAttributes || [],
    });
  } catch (error) {
    console.error('Get MFA status error:', error);
    return createResponse(500, { error: errorMessage(error, 'Error getting MFA status') });
  }
};

/**
 * Disables software-token MFA for the authenticated user.
 *
 * @param {object} event API Gateway/Lambda event.
 * @returns {Promise<object>} API Gateway-compatible response.
 */
module.exports.disableMFA = async (event) => {
  try {
    const accessToken = getAccessToken(event);
    if (!accessToken) return createResponse(401, { error: 'Authorization token required' });

    await authService.disableMfa(accessToken);
    return createResponse(200, { message: 'MFA disabled successfully' });
  } catch (error) {
    console.error('Disable MFA error:', error);
    return createResponse(500, { error: errorMessage(error, 'Error disabling MFA') });
  }
};