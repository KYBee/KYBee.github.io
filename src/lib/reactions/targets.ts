import {
  MAX_BOOTSTRAP_TARGETS,
  type ReactionTargetId,
  type ReactionTargetManifest,
} from './contracts';

const REACTION_ENTRY_ID_PATTERN =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(ko|en)(?:\.ya?ml)?$/;

export const REACTION_TARGET_PATTERN =
  /^(work|side):[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const MAX_REACTION_TARGET_LENGTH = 96;

export function assertReactionTargetId(
  targetId: string,
): asserts targetId is ReactionTargetId {
  if (targetId.length > MAX_REACTION_TARGET_LENGTH) {
    throw new TypeError(
      `Reaction target IDs must be at most ${MAX_REACTION_TARGET_LENGTH} characters`,
    );
  }

  if (!REACTION_TARGET_PATTERN.test(targetId)) {
    throw new TypeError(`Invalid reaction target ID: ${targetId}`);
  }
}

export function toReactionTargetId(
  collection: 'projects' | 'sideProjects',
  entryId: string,
): ReactionTargetId {
  if (collection !== 'projects' && collection !== 'sideProjects') {
    throw new TypeError(`Unsupported reaction target collection: ${collection}`);
  }

  const entryIdMatch = REACTION_ENTRY_ID_PATTERN.exec(entryId);

  if (!entryIdMatch) {
    throw new TypeError(`Invalid localized project entry ID: ${entryId}`);
  }

  const prefix = collection === 'projects' ? 'work' : 'side';
  const targetId = `${prefix}:${entryIdMatch[1]}`;

  assertReactionTargetId(targetId);

  return targetId;
}

export function createReactionTargetManifest(
  targets: Iterable<ReactionTargetId>,
): ReactionTargetManifest {
  const uniqueTargets = new Set<ReactionTargetId>();

  for (const target of targets) {
    assertReactionTargetId(target);
    uniqueTargets.add(target);
  }

  if (uniqueTargets.size > MAX_BOOTSTRAP_TARGETS) {
    throw new TypeError(
      `Reaction target manifests support at most ${MAX_BOOTSTRAP_TARGETS} targets`,
    );
  }

  return {
    version: 1,
    targets: [...uniqueTargets].sort(),
  };
}
