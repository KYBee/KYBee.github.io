import {
  MAX_BOOTSTRAP_TARGETS,
  REACTION_EMOJIS,
  type BootstrapResponse,
  type ReactionEmoji,
  type ReactionSnapshot,
  type ReactionTargetId,
  type SetReactionResponse,
} from '../../lib/reactions/contracts';
import type { ReactionApi } from './api-client';
import type { VisitorTokenStore } from './token-store';

export interface ReactionDataController {
  bootstrap(): Promise<void>;
  destroy(): void;
}

export function createReactionDataController(options: {
  root: Document | HTMLElement;
  api: ReactionApi;
  tokenStore: VisitorTokenStore;
}): ReactionDataController {
  const { root, api, tokenStore } = options;
  const targetElements = [
    ...root.querySelectorAll<HTMLElement>('[data-reaction-target]'),
  ];
  const targets = [
    ...new Set(
      targetElements.map((element) => {
        const target = element.dataset.reactionTarget;
        if (!target) throw new TypeError('Missing reaction target');
        return target as ReactionTargetId;
      }),
    ),
  ];
  const channelRegions = [
    ...root.querySelectorAll<HTMLElement>(
      '[data-reaction-channel-status]',
    ),
  ];
  const stateByTarget = new Map<ReactionTargetId, ReactionSnapshot>();
  const pendingKeys = new Set<string>();
  let bootstrapPromise: Promise<void> | undefined;
  let bootstrapFailed = false;
  let destroyed = false;
  let visitorToken: string | undefined;

  try {
    visitorToken = tokenStore.get();
  } catch {
    visitorToken = undefined;
  }

  const keyFor = (target: ReactionTargetId, emoji: ReactionEmoji) =>
    `${target}\0${emoji}`;

  const isRecord = (
    value: unknown,
  ): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

  const isEmoji = (value: string): value is ReactionEmoji =>
    (REACTION_EMOJIS as readonly string[]).includes(value);

  const copySnapshot = (
    value: unknown,
  ): ReactionSnapshot => {
    if (!isRecord(value)) throw new TypeError('Invalid reaction snapshot');
    const keys = Object.keys(value).sort();
    if (
      keys.length !== 2 ||
      keys[0] !== 'counts' ||
      keys[1] !== 'selected' ||
      !isRecord(value.counts) ||
      !Array.isArray(value.selected)
    ) {
      throw new TypeError('Invalid reaction snapshot');
    }

    const rawCounts = value.counts;
    const rawSelected = value.selected;
    const countKeys = Object.keys(rawCounts);
    if (
      countKeys.length !== REACTION_EMOJIS.length ||
      !REACTION_EMOJIS.every((emoji) => countKeys.includes(emoji))
    ) {
      throw new TypeError('Invalid reaction counts');
    }

    const counts = Object.fromEntries(
      REACTION_EMOJIS.map((emoji) => {
        const count = rawCounts[emoji];
        if (
          typeof count !== 'number' ||
          !Number.isSafeInteger(count) ||
          count < 0
        ) {
          throw new TypeError('Invalid reaction count');
        }
        return [emoji, count];
      }),
    ) as ReactionSnapshot['counts'];

    const selected = rawSelected.map((emoji) => {
      if (typeof emoji !== 'string' || !isEmoji(emoji)) {
        throw new TypeError('Invalid selected reaction');
      }
      return emoji;
    });
    if (
      new Set(selected).size !== selected.length ||
      selected.some((emoji) => counts[emoji] === 0)
    ) {
      throw new TypeError('Invalid selected reactions');
    }
    selected.sort(
      (left, right) =>
        REACTION_EMOJIS.indexOf(left) - REACTION_EMOJIS.indexOf(right),
    );
    return { counts, selected };
  };

  const validateBootstrap = (
    value: BootstrapResponse,
  ): {
    token: string;
    snapshots: Map<ReactionTargetId, ReactionSnapshot>;
  } => {
    if (
      !isRecord(value) ||
      typeof value.visitorToken !== 'string' ||
      !/^v1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/u.test(
        value.visitorToken,
      ) ||
      !isRecord(value.reactions)
    ) {
      throw new TypeError('Invalid bootstrap response');
    }
    const responseTargets = Object.keys(value.reactions).sort();
    if (
      JSON.stringify(responseTargets) !==
      JSON.stringify([...targets].sort())
    ) {
      throw new TypeError('Bootstrap targets do not match the page');
    }
    return {
      token: value.visitorToken,
      snapshots: new Map(
        targets.map((target) => [
          target,
          copySnapshot(value.reactions[target]),
        ]),
      ),
    };
  };

  const elementsFor = (target: ReactionTargetId) =>
    targetElements.filter(
      (element) => element.dataset.reactionTarget === target,
    );

  const setPressed = (
    snapshot: ReactionSnapshot,
    emoji: ReactionEmoji,
    active: boolean,
  ) => {
    snapshot.selected = active
      ? [...new Set([...snapshot.selected, emoji])].sort(
          (left, right) =>
            REACTION_EMOJIS.indexOf(left) -
            REACTION_EMOJIS.indexOf(right),
        )
      : snapshot.selected.filter((selected) => selected !== emoji);
  };

  const renderTarget = (target: ReactionTargetId) => {
    const snapshot = stateByTarget.get(target);
    if (!snapshot) return;

    for (const message of elementsFor(target)) {
      const controls = message.querySelector<HTMLElement>(
        '[data-reaction-controls]',
      );
      const counts = message.querySelector<HTMLElement>(
        '[data-reaction-counts]',
      );
      if (!controls || !counts) continue;

      const actions = new Map<ReactionEmoji, HTMLButtonElement>();
      for (const action of controls.querySelectorAll<HTMLButtonElement>(
        '[data-reaction-emoji]',
      )) {
        const emoji = action.dataset.reactionEmoji;
        if (emoji && isEmoji(emoji)) actions.set(emoji, action);
      }

      for (const emoji of REACTION_EMOJIS) {
        const action = actions.get(emoji);
        if (!action) continue;
        const selected = snapshot.selected.includes(emoji);
        const pending = pendingKeys.has(keyFor(target, emoji));
        const count = snapshot.counts[emoji];
        action.setAttribute('aria-pressed', String(selected));
        const actionCount = action.querySelector<HTMLElement>(
          '[data-reaction-action-count]',
        );
        if (actionCount) {
          actionCount.textContent = count > 0 ? String(count) : '';
          actionCount.hidden = count === 0;
        }
        action.disabled = pending;
        if (pending) action.setAttribute('aria-busy', 'true');
        else action.removeAttribute('aria-busy');
      }

      const opener = message.querySelector<HTMLButtonElement>(
        '[data-reaction-opener]',
      );
      const existingChips = new Map<ReactionEmoji, HTMLButtonElement>();
      for (const chip of counts.querySelectorAll<HTMLButtonElement>(
        '[data-reaction-count-emoji]',
      )) {
        const emoji = chip.dataset.reactionCountEmoji;
        if (emoji && isEmoji(emoji)) existingChips.set(emoji, chip);
      }
      const projectName = controls.dataset.reactionProjectName ?? '';
      const countLabel =
        controls.dataset.reactionCountLabel ??
        '{emoji} {count}';

      REACTION_EMOJIS.forEach((emoji, index) => {
        const count = snapshot.counts[emoji];
        let chip = existingChips.get(emoji);
        if (count === 0) {
          if (
            chip &&
            chip.ownerDocument.activeElement === chip
          ) {
            opener?.focus({ preventScroll: true });
          }
          chip?.remove();
          return;
        }

        if (!chip) {
          chip = message.ownerDocument.createElement('button');
          chip.type = 'button';
          chip.className = 'reaction-count-chip';
          chip.dataset.reactionCountEmoji = emoji;
          const nextChip = REACTION_EMOJIS
            .slice(index + 1)
            .map((nextEmoji) => existingChips.get(nextEmoji))
            .find((candidate) => candidate?.isConnected);
          counts.insertBefore(chip, nextChip ?? null);
          existingChips.set(emoji, chip);
        }

        const pending = pendingKeys.has(keyFor(target, emoji));
        chip.textContent = `${emoji} ${count}`;
        chip.setAttribute(
          'aria-pressed',
          String(snapshot.selected.includes(emoji)),
        );
        const localizedCount = countLabel
          .replace('{emoji}', emoji)
          .replace('{count}', String(count));
        chip.setAttribute(
          'aria-label',
          projectName
            ? `${projectName}: ${localizedCount}`
            : localizedCount,
        );
        chip.disabled = pending;
        if (pending) chip.setAttribute('aria-busy', 'true');
        else chip.removeAttribute('aria-busy');
      });
    }
  };

  const setControlsAvailable = (available: boolean) => {
    for (const message of targetElements) {
      const controls = message.querySelector<HTMLElement>(
        '[data-reaction-controls]',
      );
      if (!controls) continue;
      controls.hidden = !available;
      for (const action of controls.querySelectorAll<HTMLButtonElement>(
        '[data-reaction-emoji]',
      )) {
        action.disabled = !available;
      }
    }
  };

  const showBootstrapFailure = () => {
    bootstrapFailed = true;
    setControlsAvailable(false);
    for (const region of channelRegions) {
      region.hidden = false;
      const status = region.querySelector<HTMLElement>(
        '[data-reaction-bootstrap-status]',
      );
      if (status) {
        status.textContent = region.dataset.bootstrapError ?? '';
      }
      const retry = region.querySelector<HTMLButtonElement>(
        '[data-reaction-retry]',
      );
      if (retry) retry.disabled = false;
    }
  };

  const setRetrying = () => {
    if (!bootstrapFailed) return;
    for (const region of channelRegions) {
      region.hidden = false;
      const status = region.querySelector<HTMLElement>(
        '[data-reaction-bootstrap-status]',
      );
      if (status) status.textContent = region.dataset.retrying ?? '';
      const retry = region.querySelector<HTMLButtonElement>(
        '[data-reaction-retry]',
      );
      if (retry) retry.disabled = true;
    }
  };

  const hideRetry = () => {
    bootstrapFailed = false;
    for (const region of channelRegions) {
      region.hidden = true;
      const status = region.querySelector<HTMLElement>(
        '[data-reaction-bootstrap-status]',
      );
      if (status) status.textContent = '';
      const retry = region.querySelector<HTMLButtonElement>(
        '[data-reaction-retry]',
      );
      if (retry) retry.disabled = false;
    }
  };

  const bootstrap = (): Promise<void> => {
    if (destroyed || targets.length === 0) return Promise.resolve();
    if (targets.length > MAX_BOOTSTRAP_TARGETS) {
      showBootstrapFailure();
      return Promise.resolve();
    }
    if (bootstrapPromise) return bootstrapPromise;
    setRetrying();

    const request = (async () => {
      try {
        const response = await api.bootstrap(
          { targets },
          visitorToken,
        );
        if (destroyed) return;
        const validated = validateBootstrap(response);
        visitorToken = validated.token;
        try {
          tokenStore.set(validated.token);
        } catch {
          // The in-memory token remains authoritative for this page.
        }
        stateByTarget.clear();
        for (const [target, snapshot] of validated.snapshots) {
          stateByTarget.set(target, snapshot);
        }
        setControlsAvailable(true);
        for (const target of targets) renderTarget(target);
        hideRetry();
      } catch {
        if (!destroyed) showBootstrapFailure();
      }
    })();

    bootstrapPromise = request.finally(() => {
      bootstrapPromise = undefined;
    });
    return bootstrapPromise;
  };

  const validateMutation = (
    value: SetReactionResponse,
    target: ReactionTargetId,
    emoji: ReactionEmoji,
  ) => {
    if (
      !isRecord(value) ||
      value.targetId !== target ||
      value.emoji !== emoji ||
      typeof value.active !== 'boolean' ||
      typeof value.count !== 'number' ||
      !Number.isSafeInteger(value.count) ||
      value.count < 0 ||
      (value.active && value.count === 0)
    ) {
      throw new TypeError('Invalid reaction response');
    }
    return { active: value.active, count: value.count };
  };

  const mutate = async (
    message: HTMLElement,
    target: ReactionTargetId,
    emoji: ReactionEmoji,
  ) => {
    const snapshot = stateByTarget.get(target);
    if (!snapshot || !visitorToken) return;
    const pendingKey = keyFor(target, emoji);
    if (pendingKeys.has(pendingKey)) return;

    const previous = {
      count: snapshot.counts[emoji],
      selected: snapshot.selected.includes(emoji),
    };
    const desiredActive = !previous.selected;
    const status = message.querySelector<HTMLElement>(
      '[data-reaction-write-status]',
    );
    if (status) status.textContent = '';

    pendingKeys.add(pendingKey);
    snapshot.counts[emoji] = Math.max(
      0,
      previous.count + (desiredActive ? 1 : -1),
    );
    setPressed(snapshot, emoji, desiredActive);
    renderTarget(target);

    try {
      const response = validateMutation(
        await api.setReaction(
          { targetId: target, emoji, active: desiredActive },
          visitorToken,
        ),
        target,
        emoji,
      );
      if (destroyed) return;
      snapshot.counts[emoji] = response.count;
      setPressed(snapshot, emoji, response.active);
    } catch {
      if (destroyed) return;
      snapshot.counts[emoji] = previous.count;
      setPressed(snapshot, emoji, previous.selected);
      if (status) {
        const controls = message.querySelector<HTMLElement>(
          '[data-reaction-controls]',
        );
        status.textContent = controls?.dataset.reactionWriteError ?? '';
      }
    } finally {
      pendingKeys.delete(pendingKey);
      if (!destroyed) renderTarget(target);
    }
  };

  const handleClick = (event: Event) => {
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return;
    const button = eventTarget.closest<HTMLButtonElement>(
      '[data-reaction-emoji], [data-reaction-count-emoji]',
    );
    const message = button?.closest<HTMLElement>(
      '[data-reaction-target]',
    );
    if (!button || !message || !root.contains(button)) return;
    const target = message.dataset.reactionTarget as
      | ReactionTargetId
      | undefined;
    const emoji =
      button.dataset.reactionEmoji ??
      button.dataset.reactionCountEmoji;
    if (!target || !emoji || !isEmoji(emoji)) return;
    void mutate(message, target, emoji);
  };

  const handleRetry = (event: Event) => {
    const eventTarget = event.target;
    if (
      eventTarget instanceof Element &&
      eventTarget.closest('[data-reaction-retry]')
    ) {
      void bootstrap();
    }
  };

  root.addEventListener('click', handleClick, true);
  root.addEventListener('click', handleRetry);

  return {
    bootstrap,
    destroy() {
      destroyed = true;
      root.removeEventListener('click', handleClick, true);
      root.removeEventListener('click', handleRetry);
      pendingKeys.clear();
    },
  };
}
