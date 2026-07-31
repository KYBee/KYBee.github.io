import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type {
  BootstrapResponse,
  ReactionEmoji,
  ReactionSnapshot,
  ReactionTargetId,
  SetReactionResponse,
} from '../../src/lib/reactions/contracts';
import {
  ReactionHttpError,
  type ReactionApi,
} from '../../src/scripts/reactions/api-client';
import { createReactionDataController } from
  '../../src/scripts/reactions/data-controller';
import type { VisitorTokenStore } from
  '../../src/scripts/reactions/token-store';
import {
  TEST_VISITOR_TOKEN,
  actionButton,
  bootstrapResponse,
  countChip,
  createChannelStatus,
  createReactionMessage,
  createReactionPageFixture,
  deferred,
  flushAsyncWork,
  requiredElement,
  snapshot,
  type ReactionPageFixture,
} from './fixtures';

const REPLACEMENT_TOKEN = `v1.${'c'.repeat(43)}.${'d'.repeat(43)}`;

function apiDouble(): {
  api: ReactionApi;
  bootstrap: Mock<ReactionApi['bootstrap']>;
  setReaction: Mock<ReactionApi['setReaction']>;
} {
  const bootstrap = vi.fn<ReactionApi['bootstrap']>();
  const setReaction = vi.fn<ReactionApi['setReaction']>();
  return { api: { bootstrap, setReaction }, bootstrap, setReaction };
}

function storeDouble(initial?: string): {
  store: VisitorTokenStore;
  get: Mock<VisitorTokenStore['get']>;
  set: Mock<VisitorTokenStore['set']>;
} {
  const get = vi.fn<VisitorTokenStore['get']>().mockReturnValue(initial);
  const set = vi.fn<VisitorTokenStore['set']>();
  return { store: { get, set }, get, set };
}

function successful(): Record<ReactionTargetId, ReactionSnapshot> {
  return {
    'work:alpha': snapshot({ '👍': 2, '🔥': 1 }, ['🔥']),
    'work:beta': snapshot(),
    'side:booster': snapshot({ '👏': 3 }, ['👏']),
  };
}

function statusText(region: ParentNode): string {
  return requiredElement<HTMLElement>(
    region,
    '[data-reaction-bootstrap-status]',
  ).textContent ?? '';
}

function expectAvailable(page: ReactionPageFixture, available: boolean) {
  for (const message of Object.values(page.messages)) {
    const controls = requiredElement<HTMLElement>(
      message,
      '[data-reaction-controls]',
    );
    expect(controls.hidden).toBe(!available);
    for (const action of controls.querySelectorAll<HTMLButtonElement>(
      '[data-reaction-emoji]',
    )) {
      expect(action.disabled).toBe(!available);
    }
  }
}

const invalidResponses: Array<
  [string, (response: BootstrapResponse) => void]
> = [
  ['missing target', (response) => {
    const reactions = response.reactions as Partial<
      Record<ReactionTargetId, ReactionSnapshot>
    >;
    delete reactions['work:beta'];
  }],
  ['extra target', (response) => {
    response.reactions['side:extra'] = snapshot();
  }],
  ['missing count', (response) => {
    delete (
      response.reactions['work:alpha'].counts as
        Partial<ReactionSnapshot['counts']>
    )['👏'];
  }],
  ['negative count', (response) => {
    response.reactions['work:alpha'].counts['👍'] = -1;
  }],
  ['non-integer count', (response) => {
    response.reactions['work:alpha'].counts['👍'] = 1.5;
  }],
  ['unknown selection', (response) => {
    response.reactions['work:alpha'].selected = ['💯' as ReactionEmoji];
  }],
  ['zero-count selection', (response) => {
    response.reactions['work:alpha'] = snapshot({}, ['👍']);
  }],
];

describe('reaction data bootstrap', () => {
  let page: ReactionPageFixture;

  beforeEach(() => {
    page = createReactionPageFixture();
  });

  it('sends unique targets in document order and replaces the stored token', async () => {
    requiredElement(document, '#side-projects').prepend(
      createReactionMessage({
        target: 'work:alpha',
        controlsHidden: true,
        actionsDisabled: true,
      }),
    );
    const api = apiDouble();
    const tokens = storeDouble(TEST_VISITOR_TOKEN);
    api.bootstrap.mockResolvedValue(
      bootstrapResponse(page.targets, successful(), REPLACEMENT_TOKEN),
    );
    const controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: tokens.store,
    });
    await controller.bootstrap();
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
    expect(api.bootstrap).toHaveBeenCalledWith(
      { targets: page.targets },
      TEST_VISITOR_TOKEN,
    );
    expect(tokens.get).toHaveBeenCalledTimes(1);
    expect(tokens.set).toHaveBeenCalledWith(REPLACEMENT_TOKEN);
  });

  it('reveals controls and renders keyed positive localized chips', async () => {
    const api = apiDouble();
    const tokens = storeDouble();
    page.regions.forEach((region) => {
      region.hidden = false;
    });
    api.bootstrap.mockResolvedValue(
      bootstrapResponse(page.targets, successful()),
    );
    const controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: tokens.store,
    });
    await controller.bootstrap();
    expectAvailable(page, true);
    expect(page.regions.every((region) => region.hidden)).toBe(true);
    const alpha = page.messages.workAlpha;
    expect([
      ...alpha.querySelectorAll<HTMLElement>(
        '[data-reaction-count-emoji]',
      ),
    ].map((chip) => chip.dataset.reactionCountEmoji))
      .toEqual(['👍', '🔥']);
    expect(countChip(alpha, '🎉')).toBeNull();
    expect(countChip(alpha, '👏')).toBeNull();
    expect(actionButton(alpha, '🔥').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(countChip(alpha, '🔥')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(countChip(alpha, '👍')?.getAttribute('aria-label')).toBe(
      'Alpha: 👍 reaction count 2',
    );
  });

  it('keeps the returned token in memory when storage throws', async () => {
    const api = apiDouble();
    api.bootstrap.mockResolvedValue(
      bootstrapResponse(page.targets, successful()),
    );
    api.setReaction.mockResolvedValue({
      targetId: 'side:booster', emoji: '🔥', active: true, count: 1,
    });
    const controller = createReactionDataController({
      root: page.root,
      api: api.api,
      tokenStore: {
        get: () => undefined,
        set: () => {
          throw new DOMException('blocked', 'QuotaExceededError');
        },
      },
    });
    await controller.bootstrap();
    actionButton(page.messages.sideBooster, '🔥').click();
    await flushAsyncWork();
    expect(api.setReaction).toHaveBeenCalledWith({
      targetId: 'side:booster', emoji: '🔥', active: true,
    }, TEST_VISITOR_TOKEN);
  });

  it.each(invalidResponses)('fails closed for %s', async (_label, corrupt) => {
    const api = apiDouble();
    const response = bootstrapResponse(page.targets, successful());
    corrupt(response);
    api.bootstrap.mockResolvedValue(response);
    const controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: storeDouble().store,
    });
    await controller.bootstrap();
    expectAvailable(page, false);
    expect(page.regions.every((region) => !region.hidden)).toBe(true);
  });

  it('preserves content and shows one localized retry row per channel', async () => {
    const api = apiDouble();
    api.bootstrap.mockRejectedValue(new TypeError('offline'));
    const controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: storeDouble().store,
    });
    await controller.bootstrap();
    expectAvailable(page, false);
    expect(page.regions).toHaveLength(2);
    for (const region of page.regions) {
      expect(region.hidden).toBe(false);
      expect(statusText(region)).toBe(region.dataset.bootstrapError);
    }
    expect(page.root.textContent).toContain('Ordinary project summary');
    expect(page.root.querySelectorAll('.tag-pill')).toHaveLength(3);
    expect(page.root.querySelectorAll('.badge-pill')).toHaveLength(3);
  });

  it('coalesces pending retries and enables both channels on success', async () => {
    const api = apiDouble();
    api.bootstrap.mockRejectedValueOnce(new TypeError('offline'));
    const pending = deferred<BootstrapResponse>();
    api.bootstrap.mockReturnValueOnce(pending.promise);
    const controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: storeDouble().store,
    });
    await controller.bootstrap();
    requiredElement<HTMLButtonElement>(
      page.regions[0], '[data-reaction-retry]',
    ).click();
    requiredElement<HTMLButtonElement>(
      page.regions[1], '[data-reaction-retry]',
    ).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(api.bootstrap).toHaveBeenCalledTimes(2);
    pending.resolve(bootstrapResponse(page.targets, successful()));
    await pending.promise;
    await flushAsyncWork();
    expectAvailable(page, true);
    expect(page.regions.every((region) => region.hidden)).toBe(true);
  });
});

describe('reaction data mutations', () => {
  let page: ReactionPageFixture;
  let api: ReturnType<typeof apiDouble>;
  let controller: ReturnType<typeof createReactionDataController>;

  beforeEach(async () => {
    page = createReactionPageFixture();
    api = apiDouble();
    api.bootstrap.mockResolvedValue(
      bootstrapResponse(page.targets, successful()),
    );
    controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: storeDouble().store,
    });
    await controller.bootstrap();
  });

  it('optimistically updates and locks only the pending target/emoji', () => {
    const pending = deferred<SetReactionResponse>();
    api.setReaction.mockReturnValueOnce(pending.promise);
    const message = page.messages.sideBooster;
    const action = actionButton(message, '🔥');
    action.click();
    action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(action.getAttribute('aria-pressed')).toBe('true');
    expect(countChip(message, '🔥')?.textContent).toBe('🔥 1');
    expect(action.disabled).toBe(true);
    expect(action.getAttribute('aria-busy')).toBe('true');
    expect(countChip(message, '🔥')?.disabled).toBe(true);
    expect(api.setReaction).toHaveBeenCalledTimes(1);
  });

  it('removes a zero chip and moves focus to the opener', async () => {
    controller.destroy();
    page = createReactionPageFixture();
    api = apiDouble();
    api.bootstrap.mockResolvedValue(bootstrapResponse(page.targets, {
      ...successful(),
      'side:booster': snapshot({ '👏': 1 }, ['👏']),
    }));
    controller = createReactionDataController({
      root: page.root, api: api.api, tokenStore: storeDouble().store,
    });
    await controller.bootstrap();
    const pending = deferred<SetReactionResponse>();
    api.setReaction.mockReturnValueOnce(pending.promise);
    const message = page.messages.sideBooster;
    const chip = countChip(message, '👏');
    const opener = requiredElement<HTMLButtonElement>(
      message, '[data-reaction-opener]',
    );
    if (!chip) throw new Error('Expected selected chip');
    chip.focus();
    chip.click();
    expect(countChip(message, '👏')).toBeNull();
    expect(document.activeElement).toBe(opener);
    pending.resolve({
      targetId: 'side:booster', emoji: '👏', active: false, count: 0,
    });
    await pending.promise;
    await flushAsyncWork();
  });

  it('allows another emoji and rolls back without overwriting its success', async () => {
    const thumbs = deferred<SetReactionResponse>();
    const fire = deferred<SetReactionResponse>();
    api.setReaction.mockImplementation((request) =>
      request.emoji === '👍' ? thumbs.promise : fire.promise
    );
    const message = page.messages.workBeta;
    actionButton(message, '👍').click();
    actionButton(message, '🔥').click();
    expect(api.setReaction).toHaveBeenCalledTimes(2);
    fire.resolve({
      targetId: 'work:beta', emoji: '🔥', active: true, count: 4,
    });
    await fire.promise;
    await flushAsyncWork();
    thumbs.reject(new TypeError('offline'));
    await thumbs.promise.catch(() => undefined);
    await flushAsyncWork();
    expect(countChip(message, '👍')).toBeNull();
    expect(countChip(message, '🔥')?.textContent).toBe('🔥 4');
    expect(actionButton(message, '🔥').getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('reconciles server state without replacing or defocusing a chip', async () => {
    const pending = deferred<SetReactionResponse>();
    api.setReaction.mockReturnValueOnce(pending.promise);
    const message = page.messages.workAlpha;
    const before = countChip(message, '👍');
    if (!before) throw new Error('Expected existing count chip');
    before.focus();
    actionButton(message, '👍').click();
    pending.resolve({
      targetId: 'work:alpha', emoji: '👍', active: false, count: 7,
    });
    await pending.promise;
    await flushAsyncWork();
    const after = countChip(message, '👍');
    expect(after).toBe(before);
    expect(after?.textContent).toBe('👍 7');
    expect(after?.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(before);
  });

  it('restores one failed emoji and announces a nearby status', async () => {
    api.setReaction.mockRejectedValueOnce(new TypeError('offline'));
    const message = page.messages.workAlpha;
    actionButton(message, '👍').click();
    expect(countChip(message, '👍')?.textContent).toBe('👍 3');
    await flushAsyncWork();
    expect(countChip(message, '👍')?.textContent).toBe('👍 2');
    expect(actionButton(message, '👍').getAttribute('aria-pressed')).toBe(
      'false',
    );
    const status = requiredElement<HTMLElement>(
      message, '[data-reaction-write-status]',
    );
    expect(status.hidden).toBe(false);
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('The reaction was not saved.');
  });

  it('does not retry a 429 write failure', async () => {
    api.setReaction.mockRejectedValueOnce(
      new ReactionHttpError(429, 'rate_limited'),
    );
    actionButton(page.messages.workBeta, '🎉').click();
    await flushAsyncWork();
    expect(api.setReaction).toHaveBeenCalledTimes(1);
    expect(countChip(page.messages.workBeta, '🎉')).toBeNull();
  });

  it('destroy removes delegated mutation and retry handlers', () => {
    controller.destroy();
    actionButton(page.messages.workAlpha, '👍').click();
    page.regions.forEach((region) =>
      requiredElement<HTMLButtonElement>(
        region, '[data-reaction-retry]',
      ).click()
    );
    expect(api.setReaction).not.toHaveBeenCalled();
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
  });
});

describe('reaction target limit', () => {
  const largeFixture = (size: number) => {
    document.body.innerHTML = '';
    const root = document.createElement('main');
    const targets = Array.from(
      { length: size },
      (_, index) => `work:project-${index}` as ReactionTargetId,
    );
    targets.forEach((target) => root.append(createReactionMessage({
      target, controlsHidden: true, actionsDisabled: true,
    })));
    const region = createChannelStatus('work');
    root.append(region);
    document.body.append(root);
    return { root, targets, region };
  };

  it('rejects 101 locally but sends exactly 100 once', async () => {
    const tooMany = largeFixture(101);
    const rejectedApi = apiDouble();
    const rejected = createReactionDataController({
      root: tooMany.root,
      api: rejectedApi.api,
      tokenStore: storeDouble().store,
    });
    await rejected.bootstrap();
    expect(rejectedApi.bootstrap).not.toHaveBeenCalled();
    expect(tooMany.region.hidden).toBe(false);

    const maximum = largeFixture(100);
    const acceptedApi = apiDouble();
    acceptedApi.bootstrap.mockResolvedValue(
      bootstrapResponse(maximum.targets),
    );
    const accepted = createReactionDataController({
      root: maximum.root,
      api: acceptedApi.api,
      tokenStore: storeDouble().store,
    });
    await accepted.bootstrap();
    expect(acceptedApi.bootstrap).toHaveBeenCalledTimes(1);
    expect(acceptedApi.bootstrap).toHaveBeenCalledWith(
      { targets: maximum.targets },
      undefined,
    );
  });
});
