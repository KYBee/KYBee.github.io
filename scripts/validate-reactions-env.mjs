import { pathToFileURL } from 'node:url';

export function validateReactionsApiUrl(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new TypeError('PUBLIC_REACTIONS_API_URL is required');
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new TypeError('PUBLIC_REACTIONS_API_URL must be a string');
  }
  if (value.trim() !== value) {
    throw new TypeError(
      'PUBLIC_REACTIONS_API_URL must not contain surrounding whitespace',
    );
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('PUBLIC_REACTIONS_API_URL must be an absolute URL');
  }
  if (url.protocol !== 'https:') {
    throw new TypeError('PUBLIC_REACTIONS_API_URL must use HTTPS');
  }
  if (!url.hostname) {
    throw new TypeError('PUBLIC_REACTIONS_API_URL must contain a host');
  }
  if (url.username || url.password) {
    throw new TypeError(
      'PUBLIC_REACTIONS_API_URL must not contain credentials',
    );
  }
  if (url.pathname !== '/') {
    throw new TypeError(
      'PUBLIC_REACTIONS_API_URL must be an origin without a path',
    );
  }
  if (url.search) {
    throw new TypeError('PUBLIC_REACTIONS_API_URL must not contain a query');
  }
  if (url.hash) {
    throw new TypeError('PUBLIC_REACTIONS_API_URL must not contain a fragment');
  }
  return url.origin;
}

async function runCli() {
  try {
    validateReactionsApiUrl(process.env.PUBLIC_REACTIONS_API_URL, {
      required: process.argv.slice(2).includes('--required'),
    });
    process.stdout.write('Reaction API URL configuration is valid.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runCli();
}
