const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

/**
 * Creates an API Gateway-compatible JSON response.
 *
 * @param {number} statusCode HTTP status code.
 * @param {object} body Serializable response payload.
 * @returns {{statusCode: number, headers: object, body: string}} HTTP response.
 */
const createResponse = (statusCode, body) => ({
  statusCode,
  headers: RESPONSE_HEADERS,
  body: JSON.stringify(body),
});

/**
 * Parses an optional Lambda event body.
 *
 * @param {{body?: string|object}} event API Gateway/Lambda event.
 * @returns {object} Parsed request body, or an empty object when absent.
 * @throws {Error} When the body is not valid JSON.
 */
const parseBody = (event) => {
  if (!event?.body) return {};
  return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
};

/**
 * Extracts a bearer token from API Gateway headers.
 *
 * @param {{headers?: Record<string, string>}} event API Gateway/Lambda event.
 * @returns {string} Access token, or an empty string when absent.
 */
const getAccessToken = (event) => {
  const headers = event?.headers || {};
  const authorization = headers.authorization || headers.Authorization || '';
  return authorization.replace(/^Bearer\s+/i, '').trim();
};

module.exports = { createResponse, parseBody, getAccessToken };