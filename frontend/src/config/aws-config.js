// This will be populated after deploying the backend
// Update these values after running: serverless info
export const awsConfig = {
  region: 'us-east-1',
  userPoolId: process.env.REACT_APP_USER_POOL_ID || '',
  userPoolWebClientId: process.env.REACT_APP_CLIENT_ID || '',
  apiEndpoint: process.env.REACT_APP_API_ENDPOINT || '',
};

