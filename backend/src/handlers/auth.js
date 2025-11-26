const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
  AdminGetUserCommand,
  GetUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const client = new CognitoIdentityProviderClient({ region: process.env.REGION });

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;

const createResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  },
  body: JSON.stringify(body),
});

// Signup handler
module.exports.signup = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { email, password, name } = body;

    if (!email || !password) {
      return createResponse(400, { error: 'Email and password are required' });
    }

    // Create user
    const createUserCommand = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        ...(name ? [{ Name: 'name', Value: name }] : []),
      ],
      MessageAction: 'SUPPRESS', // Suppress welcome email
    });

    await client.send(createUserCommand);

    // Set permanent password
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: password,
      Permanent: true,
    });

    await client.send(setPasswordCommand);

    return createResponse(200, {
      message: 'User created successfully',
      email,
    });
  } catch (error) {
    console.error('Signup error:', error);
    return createResponse(500, {
      error: error.message || 'Error creating user',
    });
  }
};

// Login handler
module.exports.login = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { email, password } = body;

    if (!email || !password) {
      return createResponse(400, { error: 'Email and password are required' });
    }

    // Para el login inicial, usar el email como USERNAME
    // (cuando UsernameAttributes es email, Cognito acepta el email directamente)
    const authCommand = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email, // Usar email para el login inicial
        PASSWORD: password,
      },
    });

    const response = await client.send(authCommand);

    // Si hay un challenge (como MFA), manejarlo
    if (response.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
      console.log('MFA challenge detected');
      console.log('Response:', JSON.stringify({
        ChallengeName: response.ChallengeName,
        Session: response.Session ? 'present' : 'missing',
        ChallengeParameters: response.ChallengeParameters,
      }));
      
      // Para la verificación MFA, necesitamos el username
      // Cuando UsernameAttributes es email, Cognito puede no incluir USERNAME en ChallengeParameters
      // En ese caso, usamos el email original que se envió en el login
      // El email funciona como username cuando UsernameAttributes es email
      const usernameForMFA = response.ChallengeParameters?.USERNAME || email;
      
      console.log('Username for MFA verification:', usernameForMFA);
      console.log('ChallengeParameters keys:', Object.keys(response.ChallengeParameters || {}));
      
      return createResponse(200, {
        challengeName: 'SOFTWARE_TOKEN_MFA',
        session: response.Session,
        username: usernameForMFA, // Usar USERNAME de ChallengeParameters si existe, sino el email
        message: 'MFA verification required',
      });
    }

    // Si no hay challenge, el login fue exitoso
    if (!response.AuthenticationResult) {
      console.error('No AuthenticationResult in response');
      console.error('Response:', JSON.stringify(response));
      return createResponse(500, {
        error: 'Authentication failed: No authentication result received',
      });
    }

    return createResponse(200, {
      accessToken: response.AuthenticationResult.AccessToken,
      refreshToken: response.AuthenticationResult.RefreshToken,
      idToken: response.AuthenticationResult.IdToken,
      expiresIn: response.AuthenticationResult.ExpiresIn,
    });
  } catch (error) {
    console.error('Login error:', error);
    return createResponse(401, {
      error: error.message || 'Invalid credentials',
    });
  }
};

// Verify MFA handler
module.exports.verifyMFA = async (event) => {
  try {
    console.log('Raw event body:', event.body);
    const body = event.body ? JSON.parse(event.body) : {};
    console.log('Parsed body:', JSON.stringify(body));
    const { session, code, username } = body;

    console.log('MFA Verification Request:', {
      hasSession: !!session,
      hasCode: !!code,
      hasUsername: !!username,
      username: username,
      sessionLength: session ? session.length : 0,
      bodyKeys: Object.keys(body),
    });

    if (!session || !code) {
      return createResponse(400, {
        error: 'Session and MFA code are required',
      });
    }

    // Validar y obtener el username
    // Cuando UsernameAttributes es email, Cognito acepta el email como username
    // El username puede venir de ChallengeParameters.USERNAME o ser el email original
    let finalUsername = username;
    
    if (!finalUsername || finalUsername.trim() === '') {
      console.error('Username missing or empty in request body');
      console.error('Request body:', JSON.stringify(body));
      console.error('Body keys:', Object.keys(body));
      return createResponse(400, {
        error: 'Username is required for MFA verification',
        debug: 'Username not provided in request',
        receivedBody: body,
      });
    }

    // El username puede ser el email (cuando UsernameAttributes es email) o un hash
    finalUsername = finalUsername.trim();
    
    const challengeResponses = {
      SOFTWARE_TOKEN_MFA_CODE: code.toString().trim(),
      USERNAME: finalUsername, // Requerido por Cognito - puede ser email o hash según configuración
    };

    console.log('Challenge responses:', {
      hasCode: !!challengeResponses.SOFTWARE_TOKEN_MFA_CODE,
      hasUsername: !!challengeResponses.USERNAME,
      username: challengeResponses.USERNAME,
      codeLength: challengeResponses.SOFTWARE_TOKEN_MFA_CODE.length,
      challengeResponses: challengeResponses,
    });

    // Validar que el USERNAME no esté vacío antes de enviar
    if (!challengeResponses.USERNAME || challengeResponses.USERNAME.trim() === '') {
      console.error('USERNAME is empty after processing');
      return createResponse(400, {
        error: 'Username cannot be empty',
        debug: 'Username was empty after processing',
      });
    }

    const challengeCommand = new RespondToAuthChallengeCommand({
      ClientId: CLIENT_ID,
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      Session: session,
      ChallengeResponses: challengeResponses,
    });

    console.log('Sending challenge response with USERNAME:', challengeResponses.USERNAME);
    console.log('Full challenge command:', JSON.stringify({
      ClientId: CLIENT_ID,
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      Session: session ? 'present' : 'missing',
      ChallengeResponses: challengeResponses,
    }));

    const response = await client.send(challengeCommand);
    console.log('MFA verification successful');

    return createResponse(200, {
      accessToken: response.AuthenticationResult.AccessToken,
      refreshToken: response.AuthenticationResult.RefreshToken,
      idToken: response.AuthenticationResult.IdToken,
      expiresIn: response.AuthenticationResult.ExpiresIn,
    });
  } catch (error) {
    console.error('MFA verification error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', JSON.stringify(error, null, 2));
    
    // Retornar el código de error específico de Cognito
    const statusCode = error.name === 'NotAuthorizedException' || 
                      error.name === 'CodeMismatchException' ? 401 : 500;
    
    return createResponse(statusCode, {
      error: error.message || 'Invalid MFA code',
      errorName: error.name,
      errorCode: error.code,
    });
  }
};

// Setup MFA handler (get secret code)
module.exports.setupMFA = async (event) => {
  try {
    // HTTP API uses lowercase headers
    // The JWT authorizer validates the token but the original token should still be in headers
    const authHeader = event.headers?.authorization || 
                       event.headers?.Authorization || '';
    
    if (!authHeader) {
      console.error('No authorization header found');
      console.error('Available headers:', Object.keys(event.headers || {}));
      return createResponse(401, { error: 'Authorization token required' });
    }

    // Extract token (remove 'Bearer ' prefix)
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!accessToken) {
      return createResponse(401, { error: 'Invalid authorization token format' });
    }

    console.log('Setting up MFA for token (first 20 chars):', accessToken.substring(0, 20) + '...');

    const associateCommand = new AssociateSoftwareTokenCommand({
      AccessToken: accessToken,
    });

    const response = await client.send(associateCommand);

    return createResponse(200, {
      secretCode: response.SecretCode,
      message: 'Scan this QR code with your authenticator app',
    });
  } catch (error) {
    console.error('Setup MFA error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    
    // Return more specific error messages
    if (error.name === 'NotAuthorizedException') {
      return createResponse(401, {
        error: 'Invalid or expired token. Please login again.',
        errorCode: error.code,
      });
    }
    
    if (error.name === 'InvalidParameterException') {
      return createResponse(400, {
        error: 'Invalid token format',
        errorCode: error.code,
      });
    }

    return createResponse(500, {
      error: error.message || 'Error setting up MFA',
      errorCode: error.code || 'UnknownError',
    });
  }
};

// Enable MFA handler
module.exports.enableMFA = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { code } = body;
    
    // HTTP API uses lowercase headers
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!accessToken || !code) {
      return createResponse(400, {
        error: 'Authorization token and MFA code are required',
      });
    }

    // Verify the token first
    const verifyCommand = new VerifySoftwareTokenCommand({
      AccessToken: accessToken,
      UserCode: code,
    });

    const verifyResponse = await client.send(verifyCommand);

    if (verifyResponse.Status !== 'SUCCESS') {
      return createResponse(400, { error: 'Invalid MFA code' });
    }

    // Enable MFA for the user
    const setMFACommand = new SetUserMFAPreferenceCommand({
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: {
        Enabled: true,
        PreferredMfa: true,
      },
    });

    await client.send(setMFACommand);

    return createResponse(200, {
      message: 'MFA enabled successfully',
    });
  } catch (error) {
    console.error('Enable MFA error:', error);
    return createResponse(500, {
      error: error.message || 'Error enabling MFA',
    });
  }
};

// Get MFA status handler
module.exports.getMFAStatus = async (event) => {
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!accessToken) {
      return createResponse(401, { error: 'Authorization token required' });
    }

    const getUserCommand = new GetUserCommand({
      AccessToken: accessToken,
    });

    const response = await client.send(getUserCommand);

    // Check if MFA is enabled
    const mfaEnabled = response.MFAOptions?.some(option => option.DeliveryMedium === 'SOFTWARE_TOKEN') ||
                       response.PreferredMfaSetting === 'SOFTWARE_TOKEN_MFA';

    return createResponse(200, {
      mfaEnabled: mfaEnabled || false,
      preferredMfa: response.PreferredMfaSetting || null,
      mfaOptions: response.MFAOptions || [],
      userAttributes: response.UserAttributes || [],
    });
  } catch (error) {
    console.error('Get MFA status error:', error);
    return createResponse(500, {
      error: error.message || 'Error getting MFA status',
    });
  }
};

// Disable MFA handler
module.exports.disableMFA = async (event) => {
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!accessToken) {
      return createResponse(401, { error: 'Authorization token required' });
    }

    // Disable MFA for the user
    const setMFACommand = new SetUserMFAPreferenceCommand({
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: {
        Enabled: false,
        PreferredMfa: false,
      },
    });

    await client.send(setMFACommand);

    return createResponse(200, {
      message: 'MFA disabled successfully',
    });
  } catch (error) {
    console.error('Disable MFA error:', error);
    return createResponse(500, {
      error: error.message || 'Error disabling MFA',
    });
  }
};

