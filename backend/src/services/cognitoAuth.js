const {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
  GetUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

/**
 * Builds the Cognito integration used by the authentication handlers.
 * Keeping AWS commands here isolates the provider boundary from HTTP concerns.
 *
 * @param {{client: object, userPoolId: string, clientId: string}} dependencies Cognito dependencies and configuration.
 * @returns {object} Authentication service methods.
 */
const createCognitoAuthService = ({ client, userPoolId, clientId }) => ({
  /**
   * Creates a user and assigns a permanent password.
   *
   * @param {{email: string, password: string, name?: string}} input User data.
   * @returns {Promise<void>} Resolves when Cognito has created the user.
   */
  async signUp({ email, password, name }) {
    await client.send(new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        ...(name ? [{ Name: 'name', Value: name }] : []),
      ],
      MessageAction: 'SUPPRESS',
    }));

    await client.send(new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: password,
      Permanent: true,
    }));
  },

  /**
   * Initiates password authentication.
   *
   * @param {{email: string, password: string}} credentials Login credentials.
   * @returns {Promise<object>} Cognito authentication response.
   */
  initiateLogin({ email, password }) {
    return client.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }));
  },

  /**
   * Completes a software-token MFA challenge.
   *
   * @param {{session: string, code: string, username: string}} input Challenge data.
   * @returns {Promise<object>} Cognito authentication response.
   */
  verifyMfa({ session, code, username }) {
    return client.send(new RespondToAuthChallengeCommand({
      ClientId: clientId,
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      Session: session,
      ChallengeResponses: { SOFTWARE_TOKEN_MFA_CODE: code, USERNAME: username },
    }));
  },

  /**
   * Associates a software token with the authenticated user.
   *
   * @param {string} accessToken Cognito access token.
   * @returns {Promise<object>} Cognito software-token response.
   */
  associateSoftwareToken(accessToken) {
    return client.send(new AssociateSoftwareTokenCommand({ AccessToken: accessToken }));
  },

  /**
   * Verifies a TOTP code and enables software-token MFA.
   *
   * @param {string} accessToken Cognito access token.
   * @param {string} code TOTP code.
   * @returns {Promise<object>} Verification response.
   */
  async enableMfa(accessToken, code) {
    const verification = await client.send(new VerifySoftwareTokenCommand({
      AccessToken: accessToken,
      UserCode: code,
    }));
    if (verification.Status !== 'SUCCESS') return verification;

    await client.send(new SetUserMFAPreferenceCommand({
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
    }));
    return verification;
  },

  /**
   * Disables software-token MFA for the authenticated user.
   *
   * @param {string} accessToken Cognito access token.
   * @returns {Promise<void>} Resolves when MFA is disabled.
   */
  disableMfa(accessToken) {
    return client.send(new SetUserMFAPreferenceCommand({
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
    }));
  },

  /**
   * Gets the authenticated user's MFA configuration.
   *
   * @param {string} accessToken Cognito access token.
   * @returns {Promise<object>} Cognito user response.
   */
  getUser(accessToken) {
    return client.send(new GetUserCommand({ AccessToken: accessToken }));
  },
});

module.exports = { createCognitoAuthService };