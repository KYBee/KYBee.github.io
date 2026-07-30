import { describe, expect, it } from 'vitest';

import {
  compareEntryOrder,
  getCurrentProjectEntries,
  groupProjectEntries,
} from '../../src/lib/project-groups';
import type { ReactionTargetId } from '../../src/lib/reactions/contracts';
import {
  createReactionTargetManifest,
  toReactionTargetId,
} from '../../src/lib/reactions/targets';

const entry = (
  id: string,
  lang: 'ko' | 'en',
  order: number,
  company: string,
) => ({
  id,
  data: {
    lang,
    order,
    company,
    role: 'Backend Engineer',
    period: 'current',
  },
});

describe('reaction target ids', () => {
  it('maps localized project entry ids to one stable work target', () => {
    expect(toReactionTargetId('projects', 'samsung-agenthub.ko')).toBe(
      'work:samsung-agenthub',
    );
    expect(
      toReactionTargetId('projects', 'samsung-agenthub.en.yaml'),
    ).toBe('work:samsung-agenthub');
  });

  it('keeps work and side-project targets in separate namespaces', () => {
    expect(toReactionTargetId('projects', 'booster.ko')).toBe('work:booster');
    expect(toReactionTargetId('sideProjects', 'booster.en')).toBe(
      'side:booster',
    );
  });

  it('rejects invalid localized entry ids', () => {
    const invalidIds = [
      'missing-language',
      'Uppercase.ko',
      '-leading.ko',
      'double--dash.en',
      'name.fr',
    ];

    for (const id of invalidIds) {
      expect(() => toReactionTargetId('projects', id)).toThrow(TypeError);
    }
  });

  it('rejects a side target longer than 96 characters', () => {
    expect(() =>
      toReactionTargetId('sideProjects', `${'a'.repeat(92)}.ko`),
    ).toThrow(/96/);
  });

  it('sorts project entries and groups adjacent matching jobs', () => {
    const currentA = entry('current-a.ko', 'ko', 10, 'Current Company');
    const currentB = entry('current-b.en', 'en', 20, 'Current Company');
    const old = entry('old.ko', 'ko', 30, 'Current Company');
    old.data.period = 'old';
    const entries = [old, currentB, currentA];

    const groups = groupProjectEntries(entries);

    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ['current-a.ko', 'current-b.en'],
      ['old.ko'],
    ]);
    expect(entries.map((item) => item.id)).toEqual([
      'old.ko',
      'current-b.en',
      'current-a.ko',
    ]);
  });

  it('keeps matching project metadata in separate non-adjacent groups', () => {
    const firstA = entry('first-a.ko', 'ko', 10, 'Company A');
    const middleB = entry('middle-b.ko', 'ko', 20, 'Company B');
    const finalA = entry('final-a.en', 'en', 30, 'Company A');

    const groups = groupProjectEntries([finalA, middleB, firstA]);

    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ['first-a.ko'],
      ['middle-b.ko'],
      ['final-a.en'],
    ]);
  });

  it('returns only entries from the current project group', () => {
    const currentA = entry('current-a.ko', 'ko', 10, 'Current Company');
    const currentB = entry('current-b.en', 'en', 20, 'Current Company');
    const old = entry('old.ko', 'ko', 30, 'Previous Company');
    old.data.period = 'old';

    expect(
      getCurrentProjectEntries([old, currentB, currentA]).map(
        (item) => item.id,
      ),
    ).toEqual(['current-a.ko', 'current-b.en']);
  });

  it('deduplicates and sorts manifest targets', () => {
    expect(
      createReactionTargetManifest([
        'work:zeta',
        'side:alpha',
        'work:zeta',
      ]),
    ).toEqual({
      version: 1,
      targets: ['side:alpha', 'work:zeta'],
    });
  });

  it('accepts 100 manifest targets and rejects 101', () => {
    const targets = Array.from<unknown, ReactionTargetId>(
      { length: 101 },
      (_, index) => `work:project-${index}`,
    );

    expect(
      createReactionTargetManifest(targets.slice(0, 100)).targets,
    ).toHaveLength(100);
    expect(() => createReactionTargetManifest(targets)).toThrow(/100/);
  });

  it('accepts minimal sortable entries and an iterable target collection', () => {
    expect(
      compareEntryOrder({ data: { order: 20 } }, { data: { order: 10 } }),
    ).toBe(10);

    const targets = new Set<ReactionTargetId>([
      'work:zeta',
      'side:alpha',
    ]);

    expect(createReactionTargetManifest(targets).targets).toEqual([
      'side:alpha',
      'work:zeta',
    ]);
  });
});
