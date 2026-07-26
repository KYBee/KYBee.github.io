import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';

it('applies the reactions table and composite uniqueness', async () => {
  const insert = (
    targetId: string,
    emoji: string,
    visitorHash: string,
  ) => env.DB.prepare(`
      INSERT INTO reactions (target_id, emoji, visitor_hash)
      VALUES (?, ?, ?)
    `).bind(targetId, emoji, visitorHash).run();

  await insert('work:samsung-metrics', '👍', 'visitor-a');
  await expect(
    insert('work:samsung-metrics', '👍', 'visitor-b'),
  ).resolves.toMatchObject({ success: true });
  await expect(
    insert('work:samsung-metrics', '❤️', 'visitor-a'),
  ).resolves.toMatchObject({ success: true });
  await expect(
    insert('work:another-project', '👍', 'visitor-a'),
  ).resolves.toMatchObject({ success: true });
  await expect(
    insert('work:samsung-metrics', '👍', 'visitor-a'),
  ).rejects.toThrow();

  const rows = await env.DB.prepare(`
    SELECT target_id, emoji, visitor_hash
    FROM reactions
    ORDER BY target_id, emoji, visitor_hash
  `).all();
  expect(rows.results).toEqual([
    {
      target_id: 'work:another-project',
      emoji: '👍',
      visitor_hash: 'visitor-a',
    },
    {
      target_id: 'work:samsung-metrics',
      emoji: '❤️',
      visitor_hash: 'visitor-a',
    },
    {
      target_id: 'work:samsung-metrics',
      emoji: '👍',
      visitor_hash: 'visitor-a',
    },
    {
      target_id: 'work:samsung-metrics',
      emoji: '👍',
      visitor_hash: 'visitor-b',
    },
  ]);
});

it('starts the next test with no application rows', async () => {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM reactions
  `).first<{ count: number }>();
  expect(row?.count).toBe(0);
});
