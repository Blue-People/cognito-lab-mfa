/**
 * Writes a structured error entry to the Lambda error stream.
 *
 * @param {string} message Context for the error.
 * @param {Error|object} error Original error or error details.
 * @returns {void} Does not return a value.
 */
const error = (message, details) => {
  const serializedError = details instanceof Error
    ? { name: details.name, message: details.message, stack: details.stack }
    : details;

  process.stderr.write(`${JSON.stringify({ level: 'error', message, error: serializedError })}\n`);
};

module.exports = { error };