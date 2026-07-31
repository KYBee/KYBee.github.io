import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createReactionInteractionController } from
  '../../src/scripts/reactions/interaction-controller';
import {
  actionButton,
  countChip,
  createMediaQueryList,
  createReactionMessage,
  flushAsyncWork,
  requiredElement,
  type ControllableMediaQueryList,
} from './fixtures';

describe('reaction interaction controller', () => {
  let first: HTMLElement;
  let second: HTMLElement;
  let hover: ControllableMediaQueryList;
  let controller: ReturnType<typeof createReactionInteractionController>;

  beforeEach(() => {
    document.body.innerHTML = '';
    first = createReactionMessage({
      target: 'work:first', title: 'First project',
    });
    second = createReactionMessage({
      target: 'side:second', title: 'Second project',
    });
    document.body.append(first, second);
    hover = createMediaQueryList(true);
    controller = createReactionInteractionController({
      root: document, hoverMediaQuery: hover,
    });
  });

  afterEach(() => {
    controller.destroy();
    document.body.innerHTML = '';
  });

  const panel = (message: ParentNode) =>
    requiredElement<HTMLElement>(message, '[data-reaction-panel]');
  const opener = (message: ParentNode) =>
    requiredElement<HTMLButtonElement>(message, '[data-reaction-opener]');
  const summary = (message: ParentNode) =>
    requiredElement<HTMLElement>(message, '.message-summary');
  const enter = (message: HTMLElement) =>
    message.dispatchEvent(new Event('pointerenter'));
  const leave = (message: HTMLElement) =>
    message.dispatchEvent(new Event('pointerleave'));
  const expectOpen = (message: HTMLElement, expected: boolean) => {
    expect(message.classList.contains('is-reaction-open')).toBe(expected);
    expect(opener(message).getAttribute('aria-expanded')).toBe(
      String(expected),
    );
    expect(panel(message).hidden).toBe(!expected);
  };

  it('opens only the fine-pointer message under the pointer', () => {
    enter(first);
    expectOpen(first, true);
    expectOpen(second, false);
  });

  it('closes the previous panel when another message opens', () => {
    enter(first);
    enter(second);
    expectOpen(first, false);
    expectOpen(second, true);
  });

  it('keeps a panel open on pointerleave while it contains focus', () => {
    enter(first);
    actionButton(first, '👍').focus();
    leave(first);
    expectOpen(first, true);
    opener(second).focus();
    leave(first);
    expectOpen(first, false);
  });

  it('opens on keyboard focusin', () => {
    opener(first).focus();
    expectOpen(first, true);
  });

  it('keeps the panel active when a pending button loses focus', async () => {
    const action = actionButton(first, '🔥');
    action.focus();
    action.setAttribute('aria-busy', 'true');
    action.disabled = true;
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    action.dispatchEvent(new FocusEvent('focusout', {
      bubbles: true,
      relatedTarget: outside,
    }));
    await flushAsyncWork();
    expectOpen(first, true);

    action.removeAttribute('aria-busy');
    action.disabled = false;
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await flushAsyncWork();
    expectOpen(first, false);
    expect(document.activeElement).toBe(opener(first));
  });

  it('Escape closes, restores launcher focus, and does not reopen', async () => {
    const firstOpener = opener(first);
    firstOpener.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await flushAsyncWork();
    expectOpen(first, false);
    expect(document.activeElement).toBe(firstOpener);
    expect(firstOpener.hidden).toBe(false);
    expect(getComputedStyle(firstOpener).visibility).not.toBe('hidden');
  });

  it('keeps closed panel actions outside the rendered tab sequence', () => {
    const firstPanel = panel(first);
    expect(firstPanel.hidden).toBe(true);
    expect(firstPanel.querySelectorAll('button')).toHaveLength(4);
    expect(
      [...firstPanel.querySelectorAll('button')].every(
        (button) => button.closest('[hidden]') === firstPanel,
      ),
    ).toBe(true);
  });

  it('opens and focuses a hoverless message from ordinary content', () => {
    hover.setMatches(false);
    summary(first).click();
    expectOpen(first, true);
    expect(document.activeElement).toBe(first);
  });

  it('uses the pointerdown state when a mobile tap focuses before click', () => {
    hover.setMatches(false);
    summary(first).dispatchEvent(
      new Event('pointerdown', { bubbles: true }),
    );
    first.focus();
    summary(first).click();
    expectOpen(first, true);

    summary(first).dispatchEvent(
      new Event('pointerdown', { bubbles: true }),
    );
    summary(first).click();
    expectOpen(first, false);
  });

  it('closes an open hoverless message on its second content tap', async () => {
    hover.setMatches(false);
    summary(first).click();
    await flushAsyncWork();
    summary(first).click();
    expectOpen(first, false);
  });

  it('closes the mobile panel on an outside pointerdown', () => {
    hover.setMatches(false);
    summary(first).click();
    document.body.dispatchEvent(
      new Event('pointerdown', { bubbles: true }),
    );
    expectOpen(first, false);
  });

  it.each([
    ['project link', '.message-title a'],
    ['tag', '.tag-pill'],
    ['badge', '.badge-pill'],
    ['opener', '[data-reaction-opener]'],
    ['action', '[data-reaction-emoji="👍"]'],
    ['count chip', '[data-reaction-count-emoji="👍"]'],
  ])('does not treat a %s tap as a mobile message toggle', async (
    _label,
    selector,
  ) => {
    hover.setMatches(false);
    requiredElement(first, '[data-reaction-counts]').insertAdjacentHTML(
      'beforeend',
      '<button type="button" data-reaction-count-emoji="👍">👍 1</button>',
    );
    expect(countChip(first, '👍')).not.toBeNull();
    summary(first).click();
    await flushAsyncWork();
    requiredElement<HTMLElement>(first, selector).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expectOpen(first, true);
  });

  it('destroy removes listeners and closes the active panel', () => {
    enter(first);
    controller.destroy();
    expectOpen(first, false);
    enter(second);
    opener(second).focus();
    summary(second).click();
    expectOpen(second, false);
  });
});
