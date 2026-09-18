const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
const { createCognitoAuthService } = require('../services/cognitoAuth');
const { HTTP_STATUS, createResponse, parseBody, getAccessToken } = require('../utils/http');
const logger = require('../utils/logger');

const ERRORS = Object.freeze({
  INVALID_MFA: 'Invalid MFA code',
  AUTH_TOKEN_REQUIRED: 'Authorization token required',
});

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
    if (!email || !password) {
      return createResponse(HTTP_STATUS.BAD_REQUEST, { error: 'Email and password are required' });
    }

    await authService.signUp({ email, password, name });
    return createResponse(HTTP_STATUS.OK, { message: 'User created successfully', email });
  } catch (error) {
    logger.error('Signup error', error);
    return createResponse(HTTP_STATUS.INTERNAL_ERROR, { error: errorMessage(error, 'Error creating user') });
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
    if (!email || !password) {
      return createResponse(HTTP_STATUS.BAD_REQUEST, { error: 'Email and password are required' });
    }

    const result = await authService.initiateLogin({ email, password });
    if (result.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
      return createResponse(HTTP_STATUS.OK, {
        challengeName: result.ChallengeName,
        session: result.Session,
        username: result.ChallengeParameters?.USERNAME || email,
        message: 'MFA verification required',
      });
    }

    if (!result.AuthenticationResult) {
      return createResponse(HTTP_STATUS.INTERNAL_ERROR, { error: 'Authentication failed: No authentication result received' });
    }

    return createResponse(HTTP_STATUS.OK, tokensFromResult(result.AuthenticationResult));
  } catch (error) {
    logger.error('Login error', error);
    return createResponse(HTTP_STATUS.UNAUTHORIZED, { error: errorMessage(error, 'Invalid credentials') });
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
      return createResponse(HTTP_STATUS.BAD_REQUEST, { error: 'Session, MFA code and username are required' });
    }

    const result = await authService.verifyMfa({
      session,
      code: String(code).trim(),
      username: username.trim(),
    });

    if (!result.AuthenticationResult) {
      return createResponse(HTTP_STATUS.UNAUTHORIZED, { error: ERRORS.INVALID_MFA });
    }
    return createResponse(HTTP_STATUS.OK, tokensFromResult(result.AuthenticationResult));
  } catch (error) {
    logger.error('MFA verification error', error);
    let statusCode = HTTP_STATUS.INTERNAL_ERROR;
    if (['NotAuthorizedException', 'CodeMismatchException'].includes(error.name)) {
      statusCode = HTTP_STATUS.UNAUTHORIZED;
    }
    return createResponse(statusCode, { error: errorMessage(error, ERRORS.INVALID_MFA) });
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
    if (!accessToken) {
      return createResponse(HTTP_STATUS.UNAUTHORIZED, { error: ERRORS.AUTH_TOKEN_REQUIRED });
    }

    const result = await authService.associateSoftwareToken(accessToken);
    return createResponse(HTTP_STATUS.OK, {
      secretCode: result.SecretCode,
      message: 'Scan this QR code with your authenticator app',
    });
  } catch (error) {
    logger.error('Setup MFA error', error);
    let statusCode = HTTP_STATUS.INTERNAL_ERROR;
    if (error.name === 'NotAuthorizedException') {
      statusCode = HTTP_STATUS.UNAUTHORIZED;
    } else if (error.name === 'InvalidParameterException') {
      statusCode = HTTP_STATUS.BAD_REQUEST;
    } else {
      statusCode = HTTP_STATUS.INTERNAL_ERROR;
    }
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
    if (!accessToken || !code) {
      return createResponse(HTTP_STATUS.BAD_REQUEST, { error: 'Authorization token and MFA code are required' });
    }

    const result = await authService.enableMfa(accessToken, String(code).trim());
    if (!result.success) {
      return createResponse(HTTP_STATUS.BAD_REQUEST, { error: ERRORS.INVALID_MFA });
    }
    return createResponse(HTTP_STATUS.OK, { message: 'MFA enabled successfully' });
  } catch (error) {
    logger.error('Enable MFA error', error);
    return createResponse(HTTP_STATUS.INTERNAL_ERROR, { error: errorMessage(error, 'Error enabling MFA') });
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
    if (!accessToken) {
      return createResponse(HTTP_STATUS.UNAUTHORIZED, { error: ERRORS.AUTH_TOKEN_REQUIRED });
    }

    const user = await authService.getUser(accessToken);
    const mfaEnabled = user.MFAOptions?.some(option => option.DeliveryMedium === 'SOFTWARE_TOKEN') ||
      user.PreferredMfaSetting === 'SOFTWARE_TOKEN_MFA';

    return createResponse(HTTP_STATUS.OK, {
      mfaEnabled: Boolean(mfaEnabled),
      preferredMfa: user.PreferredMfaSetting || null,
      mfaOptions: user.MFAOptions || [],
      userAttributes: user.UserAttributes || [],
    });
  } catch (error) {
    logger.error('Get MFA status error', error);
    return createResponse(HTTP_STATUS.INTERNAL_ERROR, { error: errorMessage(error, 'Error getting MFA status') });
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
    if (!accessToken) {
      return createResponse(HTTP_STATUS.UNAUTHORIZED, { error: ERRORS.AUTH_TOKEN_REQUIRED });
    }

    await authService.disableMfa(accessToken);
    return createResponse(HTTP_STATUS.OK, { message: 'MFA disabled successfully' });
  } catch (error) {
    logger.error('Disable MFA error', error);
    return createResponse(HTTP_STATUS.INTERNAL_ERROR, { error: errorMessage(error, 'Error disabling MFA') });
  }
};