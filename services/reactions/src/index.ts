import type {
  BootstrapResponse,
} from '../../../src/lib/reactions/contracts';
import {
  getAllowedOrigin,
  handlePreflight,
} from './cors';
import type { Env } from './env';
import {
  ApiError,
  errorResponse,
  jsonResponse,
  readJsonObject,
} from './http';
import {
  createManifestVerifier,
  type ManifestVerifier,
} from './manifest';
import {
  bootstrapReactions,
  setReaction,
} from './repository';
import {
  createIssueRateLimitKey,
  issueVisitorToken,
  type VisitorIdentity,
  verifyVisitorToken,
} from './token';
import {
  parseBearerToken,
  parseBootstrapRequest,
  parseSetReactionRequest,
} from './validation';

export interface WorkerOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  randomBytes?: () => Uint8Array;
}

function internalError(): ApiError {
  return new ApiError(
    500,
    'internal_error',
    'The reaction service could not complete the request',
  );
}

function isInvalidToken(error: unknown): error is ApiError {
  return (
    error instanceof ApiError
    && error.status === 401
    && error.code === 'invalid_token'
  );
}

async function applyRateLimit(
  limiter: Env['ISSUE_RATE_LIMITER'],
  key: string,
): Promise<void> {
  const result = await limiter.limit({ key });
  if (!result.success) {
    throw new ApiError(
      429,
      'rate_limited',
      'Too many reaction requests',
    );
  }
}

async function bootstrapIdentity(
  request: Request,
  env: Env,
  randomBytes?: () => Uint8Array,
): Promise<VisitorIdentity> {
  const authorization = request.headers.get('Authorization');
  if (authorization !== null) {
    try {
      const token = parseBearerToken(authorization);
      const { visitorHash } = await verifyVisitorToken(
        env.REACTION_HMAC_SECRET,
        token,
      );
      return { token, visitorHash };
    } catch (error) {
      if (!isInvalidToken(error)) throw error;
    }
  }

  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) throw internalError();
  const issueKey = await createIssueRateLimitKey(
    env.REACTION_HMAC_SECRET,
    ip,
  );
  await applyRateLimit(env.ISSUE_RATE_LIMITER, issueKey);
  return issueVisitorToken(env.REACTION_HMAC_SECRET, randomBytes);
}

export function createReactionWorker(
  options: WorkerOptions = {},
): ExportedHandler<Env> {
  const manifestVerifiers = new Map<string, ManifestVerifier>();

  function getManifestVerifier(env: Env): ManifestVerifier {
    const manifestUrl = env.REACTION_TARGET_MANIFEST_URL;
    let verifier = manifestVerifiers.get(manifestUrl);
    if (!verifier) {
      verifier = createManifestVerifier({
        manifestUrl,
        fetchImpl: options.fetchImpl,
        now: options.now,
      });
      manifestVerifiers.set(manifestUrl, verifier);
    }
    return verifier;
  }

  return {
    async fetch(request, env): Promise<Response> {
      let origin: string | undefined;
      try {
        origin = getAllowedOrigin(request);
        if (request.method === 'OPTIONS') {
          return handlePreflight(request);
        }

        const path = new URL(request.url).pathname;
        const isBootstrap = path === '/v1/reactions/bootstrap';
        const isMutation = path === '/v1/reactions';
        if (!isBootstrap && !isMutation) {
          throw new ApiError(
            404,
            'invalid_request',
            'Reaction route was not found',
          );
        }
        if (
          (isBootstrap && request.method !== 'POST')
          || (isMutation && request.method !== 'PUT')
        ) {
          throw new ApiError(
            400,
            'invalid_request',
            'Reaction request method is invalid',
          );
        }

        const body = await readJsonObject(request);
        const verifier = getManifestVerifier(env);

        if (isBootstrap) {
          const { targets } = parseBootstrapRequest(body);
          const identity = await bootstrapIdentity(
            request,
            env,
            options.randomBytes,
          );
          await verifier.assertKnown(targets);
          const response: BootstrapResponse = {
            visitorToken: identity.token,
            reactions: await bootstrapReactions(
              env.DB,
              targets,
              identity.visitorHash,
            ),
          };
          return jsonResponse(response, 200, origin);
        }

        const mutation = parseSetReactionRequest(body);
        const token = parseBearerToken(
          request.headers.get('Authorization'),
        );
        const { visitorHash } = await verifyVisitorToken(
          env.REACTION_HMAC_SECRET,
          token,
        );
        await applyRateLimit(
          env.WRITE_RATE_LIMITER,
          `write:${visitorHash}`,
        );
        await verifier.assertKnown([mutation.targetId]);
        return jsonResponse(
          await setReaction(env.DB, mutation, visitorHash),
          200,
          origin,
        );
      } catch (error) {
        return errorResponse(
          error instanceof ApiError ? error : internalError(),
          origin,
        );
      }
    },
  };
}

export default createReactionWorker();
