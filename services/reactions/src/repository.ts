import {
  REACTION_EMOJIS,
  createEmptyReactionCounts,
  type ReactionEmoji,
  type ReactionSnapshot,
  type ReactionTargetId,
  type SetReactionRequest,
  type SetReactionResponse,
} from '../../../src/lib/reactions/contracts';
import { ApiError } from './http';

interface AggregateRow {
  count: number | string;
  emoji: string;
  selected: number | string;
  target_id: string;
}

function internalDatabaseError(): ApiError {
  return new ApiError(
    500,
    'internal_error',
    'The reaction service could not read its data',
  );
}

function parseCount(value: unknown): number {
  const count =
    typeof value === 'string' && /^\d+$/u.test(value)
      ? Number(value)
      : value;
  if (
    typeof count !== 'number' ||
    !Number.isSafeInteger(count) ||
    count < 0
  ) {
    throw internalDatabaseError();
  }
  return count;
}

function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value);
}

export async function bootstrapReactions(
  db: D1Database,
  targets: readonly ReactionTargetId[],
  visitorHash: string,
): Promise<Record<ReactionTargetId, ReactionSnapshot>> {
  const snapshots = Object.fromEntries(
    targets.map((target) => [
      target,
      { counts: createEmptyReactionCounts(), selected: [] },
    ]),
  ) as Record<ReactionTargetId, ReactionSnapshot>;

  if (targets.length === 0) {
    return snapshots;
  }

  const query = `
    SELECT
      target_id,
      emoji,
      COUNT(*) AS count,
      MAX(CASE WHEN visitor_hash = ? THEN 1 ELSE 0 END) AS selected
    FROM reactions
    WHERE target_id IN (SELECT value FROM json_each(?))
    GROUP BY target_id, emoji
    ORDER BY target_id, emoji
  `;
  const result = await db
    .prepare(query)
    .bind(visitorHash, JSON.stringify(targets))
    .all<AggregateRow>();

  for (const row of result.results) {
    const target = row.target_id as ReactionTargetId;
    const snapshot = snapshots[target];
    if (!snapshot || !isReactionEmoji(row.emoji)) {
      throw internalDatabaseError();
    }
    snapshot.counts[row.emoji] = parseCount(row.count);
    const selected = parseCount(row.selected);
    if (selected !== 0 && selected !== 1) {
      throw internalDatabaseError();
    }
    if (selected === 1) {
      snapshot.selected.push(row.emoji);
    }
  }

  for (const snapshot of Object.values(snapshots)) {
    snapshot.selected.sort(
      (left, right) =>
        REACTION_EMOJIS.indexOf(left) - REACTION_EMOJIS.indexOf(right),
    );
  }
  return snapshots;
}

export async function setReaction(
  db: D1Database,
  request: SetReactionRequest,
  visitorHash: string,
): Promise<SetReactionResponse> {
  const mutation = request.active
    ? db.prepare(`
        INSERT OR IGNORE INTO reactions (target_id, emoji, visitor_hash)
        VALUES (?, ?, ?)
      `).bind(request.targetId, request.emoji, visitorHash)
    : db.prepare(`
        DELETE FROM reactions
        WHERE target_id = ? AND emoji = ? AND visitor_hash = ?
      `).bind(request.targetId, request.emoji, visitorHash);

  const count = db.prepare(`
    SELECT COUNT(*) AS count
    FROM reactions
    WHERE target_id = ? AND emoji = ?
  `).bind(request.targetId, request.emoji);

  const [, countResult] = await db.batch([mutation, count]);

  const row = countResult.results[0] as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    throw internalDatabaseError();
  }
  return {
    ...request,
    count: parseCount(row.count),
  };
}
