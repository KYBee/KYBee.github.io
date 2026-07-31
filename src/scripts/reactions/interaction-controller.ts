export interface ReactionInteractionController {
  destroy(): void;
  close(): void;
}

export function createReactionInteractionController(options: {
  root: ParentNode;
  hoverMediaQuery?: MediaQueryList;
}): ReactionInteractionController {
  const { root } = options;
  const hoverMediaQuery =
    options.hoverMediaQuery ??
    window.matchMedia('(hover: hover) and (pointer: fine)');
  const messages = [
    ...root.querySelectorAll<HTMLElement>(
      '.reaction-message[data-reaction-target]',
    ),
  ];
  const hovered = new Set<HTMLElement>();
  const cleanups: Array<() => void> = [];
  let activeMessage: HTMLElement | null = null;
  let suppressFocusOpen = false;
  let pointerDownMessage: HTMLElement | null = null;
  let pointerDownWasOpen = false;

  const parts = (message: HTMLElement) => {
    const controls = message.querySelector<HTMLElement>(
      '[data-reaction-controls]',
    );
    const opener = message.querySelector<HTMLButtonElement>(
      '[data-reaction-opener]',
    );
    const panel = message.querySelector<HTMLElement>(
      '[data-reaction-panel]',
    );
    if (!controls || !opener || !panel) return undefined;
    return { controls, opener, panel };
  };

  const closeMessage = (message: HTMLElement) => {
    const elements = parts(message);
    if (!elements) return;
    message.classList.remove('is-reaction-open');
    elements.opener.setAttribute('aria-expanded', 'false');
    elements.panel.hidden = true;
    if (activeMessage === message) activeMessage = null;
  };

  const close = () => {
    if (activeMessage) closeMessage(activeMessage);
  };

  const open = (message: HTMLElement) => {
    const elements = parts(message);
    if (!elements || elements.controls.hidden) return;
    if (activeMessage && activeMessage !== message) {
      closeMessage(activeMessage);
    }
    activeMessage = message;
    message.classList.add('is-reaction-open');
    elements.opener.setAttribute('aria-expanded', 'true');
    elements.panel.hidden = false;
  };

  const listen = (
    target: EventTarget,
    type: string,
    listener: EventListener,
  ) => {
    target.addEventListener(type, listener);
    cleanups.push(() => target.removeEventListener(type, listener));
  };

  for (const message of messages) {
    const elements = parts(message);
    if (!elements) continue;

    listen(message, 'pointerdown', () => {
      if (hoverMediaQuery.matches) return;
      pointerDownMessage = message;
      pointerDownWasOpen = activeMessage === message;
    });
    listen(message, 'pointerenter', () => {
      hovered.add(message);
      if (hoverMediaQuery.matches) open(message);
    });
    listen(message, 'pointerleave', () => {
      hovered.delete(message);
      if (
        hoverMediaQuery.matches &&
        !message.contains(document.activeElement)
      ) {
        closeMessage(message);
      }
    });
    listen(message, 'focusin', () => {
      if (!suppressFocusOpen) open(message);
    });
    listen(message, 'focusout', () => {
      queueMicrotask(() => {
        if (
          activeMessage === message &&
          !hovered.has(message) &&
          !message.contains(document.activeElement) &&
          !message.querySelector('[aria-busy="true"]')
        ) {
          closeMessage(message);
        }
      });
    });
    listen(elements.opener, 'click', () => open(message));
    listen(message, 'click', (event) => {
      if (hoverMediaQuery.matches) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const pointerStartedHere = pointerDownMessage === message;
      const wasOpenAtPointerDown = pointerDownWasOpen;
      pointerDownMessage = null;
      if (
        target.closest(
          'a, button, input, select, textarea, [role="button"], ' +
            '.tag-pill, .badge-pill, [data-reaction-ignore]',
        )
      ) {
        return;
      }

      const shouldOpen = pointerStartedHere
        ? !wasOpenAtPointerDown
        : activeMessage !== message;
      suppressFocusOpen = true;
      message.focus({ preventScroll: true });
      if (shouldOpen) open(message);
      else closeMessage(message);
      queueMicrotask(() => {
        suppressFocusOpen = false;
      });
    });
  }

  listen(document, 'keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || event.key !== 'Escape') return;
    if (!activeMessage) return;
    const opener = parts(activeMessage)?.opener;
    suppressFocusOpen = true;
    close();
    opener?.focus({ preventScroll: true });
    queueMicrotask(() => {
      suppressFocusOpen = false;
    });
  });

  listen(document, 'pointerdown', (event) => {
    if (hoverMediaQuery.matches || !activeMessage) return;
    const target = event.target;
    if (target instanceof Node && !activeMessage.contains(target)) close();
  });

  listen(hoverMediaQuery, 'change', close);

  return {
    close,
    destroy() {
      close();
      hovered.clear();
      pointerDownMessage = null;
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}
