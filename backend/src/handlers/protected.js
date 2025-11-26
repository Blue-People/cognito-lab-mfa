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

module.exports.handler = async (event) => {
  try {
    // This route is protected by Cognito Authorizer
    // For HTTP API, claims are in event.requestContext.authorizer.jwt.claims
    const claims = event.requestContext?.authorizer?.jwt?.claims || 
                   event.requestContext?.authorizer?.claims || {};

    return createResponse(200, {
      message: 'This is a protected route',
      user: {
        email: claims.email || claims['cognito:username'],
        sub: claims.sub,
        name: claims.name,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Protected route error:', error);
    return createResponse(500, {
      error: error.message || 'Internal server error',
    });
  }
};

