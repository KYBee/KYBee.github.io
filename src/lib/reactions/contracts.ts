export const REACTION_EMOJIS = ['👍', '🔥', '🎉', '👏'] as const;

export const MAX_BOOTSTRAP_TARGETS = 100;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export type ReactionTargetId = `${'work' | 'side'}:${string}`;

export type ReactionCounts = Record<ReactionEmoji, number>;

export interface ReactionSnapshot {
  counts: ReactionCounts;
  selected: ReactionEmoji[];
}

export interface ReactionTargetManifest {
  version: 1;
  targets: ReactionTargetId[];
}

export interface BootstrapRequest {
  targets: ReactionTargetId[];
}

export interface BootstrapResponse {
  visitorToken: string;
  reactions: Record<ReactionTargetId, ReactionSnapshot>;
}

export interface SetReactionRequest {
  targetId: ReactionTargetId;
  emoji: ReactionEmoji;
  active: boolean;
}

export interface SetReactionResponse extends SetReactionRequest {
  count: number;
}

export type ReactionApiErrorCode =
  | 'invalid_request'
  | 'invalid_token'
  | 'forbidden_origin'
  | 'target_not_found'
  | 'rate_limited'
  | 'manifest_unavailable'
  | 'internal_error';

export interface ApiErrorResponse {
  error: {
    code: ReactionApiErrorCode;
    message: string;
  };
}

export function createEmptyReactionCounts(): ReactionCounts {
  return {
    '👍': 0,
    '🔥': 0,
    '🎉': 0,
    '👏': 0,
  };
}
