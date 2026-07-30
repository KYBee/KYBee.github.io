import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  bootstrapReactions,
  setReaction,
} from '../src/repository';
import type {
  ReactionSnapshot,
  ReactionTargetId,
} from '../../../src/lib/reactions/contracts';

async function insertReaction(
  targetId: string,
  emoji: string,
  visitorHash: string,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO reactions (target_id, emoji, visitor_hash)
    VALUES (?, ?, ?)
  `).bind(targetId, emoji, visitorHash).run();
}

async function reactionRows(): Promise<Array<{
  emoji: string;
  target_id: string;
  visitor_hash: string;
}>> {
  const result = await env.DB.prepare(`
    SELECT target_id, emoji, visitor_hash
    FROM reactions
    ORDER BY target_id, emoji, visitor_hash
  `).all<{
    emoji: string;
    target_id: string;
    visitor_hash: string;
  }>();
  return result.results;
}

describe('bootstrapReactions', () => {
  it('returns all four zero counts for every requested target', async () => {
    await expect(bootstrapReactions(
      env.DB,
      ['work:samsung-metrics', 'side:booster'],
      'visitor-a',
    )).resolves.toEqual({
      'work:samsung-metrics': {
        counts: { '👍': 0, '🔥': 0, '🎉': 0, '👏': 0 },
        selected: [],
      },
      'side:booster': {
        counts: { '👍': 0, '🔥': 0, '🎉': 0, '👏': 0 },
        selected: [],
      },
    });
  });

  it('aggregates all 100 allowed targets at the request boundary', async () => {
    const targets = Array.from(
      { length: 100 },
      (_, index) =>
        `work:project-${String(index).padStart(3, '0')}` as ReactionTargetId,
    );
    const finalTarget = targets[99];
    await insertReaction(finalTarget, '🔥', 'visitor-current');

    const expected = Object.fromEntries(
      targets.map((target) => [
        target,
        {
          counts: { '👍': 0, '🔥': 0, '🎉': 0, '👏': 0 },
          selected: [],
        },
      ]),
    ) as Record<ReactionTargetId, ReactionSnapshot>;
    expected[finalTarget] = {
      counts: { '👍': 0, '🔥': 1, '🎉': 0, '👏': 0 },
      selected: ['🔥'],
    };

    await expect(bootstrapReactions(
      env.DB,
      targets,
      'visitor-current',
    )).resolves.toEqual(expected);
  });

  it('counts another visitor without selecting it', async () => {
    await insertReaction(
      'side:booster',
      '🎉',
      'visitor-other',
    );
    await expect(bootstrapReactions(
      env.DB,
      ['side:booster'],
      'visitor-current',
    )).resolves.toEqual({
      'side:booster': {
        counts: { '👍': 0, '🔥': 0, '🎉': 1, '👏': 0 },
        selected: [],
      },
    });
  });

  it('returns selections in approved emoji order', async () => {
    await insertReaction(
      'work:samsung-metrics',
      '🔥',
      'visitor-a',
    );
    await insertReaction(
      'work:samsung-metrics',
      '👍',
      'visitor-a',
    );
    await insertReaction(
      'work:samsung-metrics',
      '👏',
      'visitor-other',
    );
    await expect(bootstrapReactions(
      env.DB,
      ['work:samsung-metrics'],
      'visitor-a',
    )).resolves.toEqual({
      'work:samsung-metrics': {
        counts: { '👍': 1, '🔥': 1, '🎉': 0, '👏': 1 },
        selected: ['👍', '🔥'],
      },
    });
  });

  it('returns only requested targets', async () => {
    await insertReaction('side:booster', '👍', 'visitor-a');
    await insertReaction(
      'work:samsung-metrics',
      '🔥',
      'visitor-a',
    );
    const snapshots = await bootstrapReactions(
      env.DB,
      ['work:samsung-metrics'],
      'visitor-a',
    );
    expect(snapshots).toEqual({
      'work:samsung-metrics': {
        counts: { '👍': 0, '🔥': 1, '🎉': 0, '👏': 0 },
        selected: ['🔥'],
      },
    });
    expect(snapshots).not.toHaveProperty('side:booster');
  });
});

describe('setReaction', () => {
  it('keeps repeated active:true at one row and count one', async () => {
    const request = {
      targetId: 'side:booster' as const,
      emoji: '🔥' as const,
      active: true,
    };
    await expect(setReaction(
      env.DB,
      request,
      'visitor-a',
    )).resolves.toMatchObject({ active: true, count: 1 });
    await expect(setReaction(
      env.DB,
      request,
      'visitor-a',
    )).resolves.toMatchObject({ active: true, count: 1 });
    expect(await reactionRows()).toHaveLength(1);
  });

  it('keeps repeated active:false at count zero', async () => {
    await setReaction(env.DB, {
      targetId: 'side:booster',
      emoji: '🔥',
      active: true,
    }, 'visitor-a');
    const remove = {
      targetId: 'side:booster' as const,
      emoji: '🔥' as const,
      active: false,
    };
    await expect(setReaction(
      env.DB,
      remove,
      'visitor-a',
    )).resolves.toMatchObject({ active: false, count: 0 });
    await expect(setReaction(
      env.DB,
      remove,
      'visitor-a',
    )).resolves.toMatchObject({ active: false, count: 0 });
    expect(await reactionRows()).toEqual([]);
  });

  it('stores different emoji as independent rows', async () => {
    await setReaction(env.DB, {
      targetId: 'work:samsung-metrics',
      emoji: '👍',
      active: true,
    }, 'visitor-a');
    await setReaction(env.DB, {
      targetId: 'work:samsung-metrics',
      emoji: '🔥',
      active: true,
    }, 'visitor-a');
    expect(await reactionRows()).toEqual([
      {
        target_id: 'work:samsung-metrics',
        emoji: '👍',
        visitor_hash: 'visitor-a',
      },
      {
        target_id: 'work:samsung-metrics',
        emoji: '🔥',
        visitor_hash: 'visitor-a',
      },
    ]);
  });

  it('counts two different visitors', async () => {
    const request = {
      targetId: 'side:booster' as const,
      emoji: '👏' as const,
      active: true,
    };
    await setReaction(env.DB, request, 'visitor-a');
    await expect(setReaction(
      env.DB,
      request,
      'visitor-b',
    )).resolves.toMatchObject({ active: true, count: 2 });
  });
});

it('rolls back the first statement when a D1 batch fails', async () => {
  const insert = env.DB.prepare(`
    INSERT INTO reactions (target_id, emoji, visitor_hash)
    VALUES (?, ?, ?)
  `).bind('work:samsung-metrics', '👍', 'visitor-a');
  const fail = env.DB.prepare(`
    INSERT INTO table_that_does_not_exist (value)
    VALUES (?)
  `).bind('force-rollback');

  await expect(env.DB.batch([insert, fail])).rejects.toThrow();
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM reactions
    WHERE target_id = ?
  `).bind('work:samsung-metrics').first<{ count: number }>();
  expect(row?.count).toBe(0);
});
