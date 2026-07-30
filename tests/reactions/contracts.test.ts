import { describe, expect, it } from 'vitest';

import {
  MAX_BOOTSTRAP_TARGETS,
  REACTION_EMOJIS,
  createEmptyReactionCounts,
} from '../../src/lib/reactions/contracts';

describe('reaction contracts', () => {
  it('defines reaction emojis in display order', () => {
    expect(REACTION_EMOJIS).toEqual(['👍', '🔥', '🎉', '👏']);
  });

  it('creates a fresh zeroed reaction count map', () => {
    const first = createEmptyReactionCounts();
    const second = createEmptyReactionCounts();

    expect(first).toEqual({ '👍': 0, '🔥': 0, '🎉': 0, '👏': 0 });
    expect(second).not.toBe(first);
  });

  it('limits bootstrap requests to 100 targets', () => {
    expect(MAX_BOOTSTRAP_TARGETS).toBe(100);
  });
});
