import {
  REACTION_EMOJIS,
  createEmptyReactionCounts,
  type BootstrapResponse,
  type ReactionEmoji,
  type ReactionSnapshot,
  type ReactionTargetId,
} from '../../src/lib/reactions/contracts';

export const TEST_VISITOR_TOKEN =
  `v1.${'a'.repeat(43)}.${'b'.repeat(43)}`;

export interface ControllableMediaQueryList extends MediaQueryList {
  setMatches(matches: boolean): void;
}

export function createMediaQueryList(
  initialMatches: boolean,
): ControllableMediaQueryList {
  const eventTarget = new EventTarget();
  let matches = initialMatches;
  let onchange: ((event: MediaQueryListEvent) => void) | null = null;
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: '(hover: hover) and (pointer: fine)',
    get onchange() {
      return onchange;
    },
    set onchange(
      listener: ((event: MediaQueryListEvent) => void) | null,
    ) {
      onchange = listener;
    },
    addListener(listener: (event: MediaQueryListEvent) => void) {
      eventTarget.addEventListener('change', listener as EventListener);
    },
    removeListener(listener: (event: MediaQueryListEvent) => void) {
      eventTarget.removeEventListener('change', listener as EventListener);
    },
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      eventTarget.addEventListener(type, listener, options);
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) {
      eventTarget.removeEventListener(type, listener, options);
    },
    dispatchEvent(event: Event) {
      return eventTarget.dispatchEvent(event);
    },
    setMatches(nextMatches: boolean) {
      if (matches === nextMatches) return;
      matches = nextMatches;
      const event = new Event('change') as MediaQueryListEvent;
      eventTarget.dispatchEvent(event);
      onchange?.(event);
    },
  };
  return mediaQuery as ControllableMediaQueryList;
}

export function createReactionMessage(options: {
  target: ReactionTargetId;
  controlsHidden?: boolean;
  actionsDisabled?: boolean;
  title?: string;
}): HTMLElement {
  const {
    target,
    controlsHidden = false,
    actionsDisabled = false,
    title = target,
  } = options;
  const id = `reactions-${target.replace(':', '-')}`;
  const message = document.createElement('article');
  message.className = 'reaction-message';
  message.dataset.reactionTarget = target;
  message.tabIndex = -1;
  message.innerHTML = `
    <p class="message-title">
      <a href="https://example.com/${target.replace(':', '-')}">${title}</a>
    </p>
    <p class="message-summary">Ordinary project summary</p>
    <div class="reactions">
      <div data-reaction-controls data-reaction-project-name="${title}"
        data-reaction-count-label="{emoji} reaction count {count}"
        data-reaction-write-error="The reaction was not saved."
        ${controlsHidden ? 'hidden' : ''}>
        <button type="button" data-reaction-opener
          aria-label="Open reactions: ${title}" aria-expanded="false"
          aria-controls="${id}">Open</button>
        <div id="${id}" data-reaction-panel role="group" hidden>
          ${REACTION_EMOJIS.map(
            (emoji) => `<button type="button" data-reaction-emoji="${emoji}"
              aria-pressed="false" ${actionsDisabled ? 'disabled' : ''}>
              ${emoji}</button>`,
          ).join('')}
        </div>
        <div data-reaction-counts></div>
        <span data-reaction-write-status role="status"
          aria-live="polite"></span>
      </div>
      <span class="tag-pill">TypeScript</span>
      <span class="badge-pill">Featured</span>
    </div>
  `;
  return message;
}

export interface ReactionPageFixture {
  root: HTMLElement;
  messages: Record<'workAlpha' | 'workBeta' | 'sideBooster', HTMLElement>;
  targets: ReactionTargetId[];
  regions: HTMLElement[];
}

export function createReactionPageFixture(): ReactionPageFixture {
  document.body.innerHTML = '';
  const root = document.createElement('main');
  const work = document.createElement('section');
  const side = document.createElement('section');
  work.id = 'work-projects';
  side.id = 'side-projects';
  const workAlpha = createReactionMessage({
    target: 'work:alpha', title: 'Alpha',
    controlsHidden: true, actionsDisabled: true,
  });
  const workBeta = createReactionMessage({
    target: 'work:beta', title: 'Beta',
    controlsHidden: true, actionsDisabled: true,
  });
  const sideBooster = createReactionMessage({
    target: 'side:booster', title: 'Booster',
    controlsHidden: true, actionsDisabled: true,
  });
  work.append(workAlpha, workBeta, createChannelStatus('work'));
  side.append(sideBooster, createChannelStatus('side'));
  root.append(work, side);
  document.body.append(root);
  return {
    root,
    messages: { workAlpha, workBeta, sideBooster },
    targets: ['work:alpha', 'work:beta', 'side:booster'],
    regions: [
      requiredElement(work, '[data-reaction-channel-status]'),
      requiredElement(side, '[data-reaction-channel-status]'),
    ],
  };
}

export function createChannelStatus(channel: string): HTMLElement {
  const region = document.createElement('div');
  region.dataset.reactionChannelStatus = channel;
  region.dataset.bootstrapError = `Could not load ${channel} reactions.`;
  region.dataset.retrying = `Retrying ${channel} reactions.`;
  region.hidden = true;
  region.innerHTML = `
    <span data-reaction-bootstrap-status aria-live="polite"></span>
    <button type="button" data-reaction-retry>Retry reactions</button>
  `;
  return region;
}

export function snapshot(
  counts: Partial<Record<ReactionEmoji, number>> = {},
  selected: ReactionEmoji[] = [],
): ReactionSnapshot {
  return {
    counts: { ...createEmptyReactionCounts(), ...counts },
    selected: [...selected],
  };
}

export function bootstrapResponse(
  targets: readonly ReactionTargetId[],
  snapshots: Partial<Record<ReactionTargetId, ReactionSnapshot>> = {},
  visitorToken = TEST_VISITOR_TOKEN,
): BootstrapResponse {
  return {
    visitorToken,
    reactions: Object.fromEntries(
      targets.map((target) => [
        target,
        snapshots[target] ?? snapshot(),
      ]),
    ) as Record<ReactionTargetId, ReactionSnapshot>,
  };
}

export function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected fixture element: ${selector}`);
  return element;
}

export function actionButton(
  message: ParentNode,
  emoji: ReactionEmoji,
): HTMLButtonElement {
  return requiredElement(message, `[data-reaction-emoji="${emoji}"]`);
}

export function countChip(
  message: ParentNode,
  emoji: ReactionEmoji,
): HTMLButtonElement | null {
  return message.querySelector(
    `[data-reaction-count-emoji="${emoji}"]`,
  );
}

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
