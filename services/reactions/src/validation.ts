import {
  MAX_BOOTSTRAP_TARGETS,
  REACTION_EMOJIS,
  type BootstrapRequest,
  type ReactionEmoji,
  type ReactionTargetId,
  type SetReactionRequest,
} from '../../../src/lib/reactions/contracts';
import { assertReactionTargetId } from '../../../src/lib/reactions/targets';
import { ApiError } from './http';

const emojiSet = new Set<string>(REACTION_EMOJIS);

function invalid(message: string): never {
  throw new ApiError(400, 'invalid_request', message);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index])
  );
}

function parseTarget(value: unknown): ReactionTargetId {
  if (typeof value !== 'string') {
    return invalid('Reaction target must be a string');
  }
  try {
    assertReactionTargetId(value);
  } catch {
    return invalid('Reaction target is invalid');
  }
  return value;
}

export function parseBootstrapRequest(
  value: Record<string, unknown>,
): BootstrapRequest {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !hasExactKeys(value, ['targets']) ||
    !Array.isArray(value.targets)
  ) {
    return invalid('Bootstrap body must contain only targets');
  }

  const targets = new Set<ReactionTargetId>();
  for (const target of value.targets) {
    targets.add(parseTarget(target));
  }
  if (targets.size === 0 || targets.size > MAX_BOOTSTRAP_TARGETS) {
    return invalid('Bootstrap must contain 1 to 100 unique targets');
  }
  return { targets: [...targets] };
}

export function parseSetReactionRequest(
  value: Record<string, unknown>,
): SetReactionRequest {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !hasExactKeys(value, ['targetId', 'emoji', 'active'])
  ) {
    return invalid('Reaction body has unexpected fields');
  }

  const targetId = parseTarget(value.targetId);
  if (typeof value.emoji !== 'string' || !emojiSet.has(value.emoji)) {
    return invalid('Reaction emoji is invalid');
  }
  if (typeof value.active !== 'boolean') {
    return invalid('Reaction active state must be boolean');
  }

  return {
    targetId,
    emoji: value.emoji as ReactionEmoji,
    active: value.active,
  };
}

export function parseBearerToken(value: string | null): string {
  const match = value === null ? null : /^Bearer ([^\s]+)$/.exec(value);
  if (!match) {
    throw new ApiError(401, 'invalid_token', 'Invalid visitor token');
  }
  return match[1];
}
