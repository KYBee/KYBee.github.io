import {
  afterEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { createReactionApi, type ReactionApi } from
  '../../src/scripts/reactions/api-client';
import type { ReactionDataController } from
  '../../src/scripts/reactions/data-controller';
import { initReactions, type InitDependencies } from
  '../../src/scripts/reactions';
import {
  createReactionInteractionController,
  type ReactionInteractionController,
} from '../../src/scripts/reactions/interaction-controller';
import {
  createVisitorTokenStore,
  type VisitorTokenStore,
} from '../../src/scripts/reactions/token-store';
import {
  createMediaQueryList,
  createReactionMessage,
  flushAsyncWork,
  requiredElement,
} from './fixtures';

interface Harness {
  dependencies: InitDependencies;
  fetchImpl: Mock<typeof fetch>;
  api: ReactionApi;
  tokenStore: VisitorTokenStore;
  createApi: Mock<InitDependencies['createApi']>;
  createData: Mock<InitDependencies['createData']>;
  createInteraction: Mock<InitDependencies['createInteraction']>;
  createTokenStore: Mock<InitDependencies['createTokenStore']>;
  bootstrap: Mock<ReactionDataController['bootstrap']>;
  destroyData: Mock<ReactionDataController['destroy']>;
  destroyInteraction: Mock<ReactionInteractionController['destroy']>;
}

function harness(): Harness {
  const fetchImpl = vi.fn<typeof fetch>();
  const api: ReactionApi = {
    bootstrap: vi.fn(),
    setReaction: vi.fn(),
  };
  const bootstrap = vi
    .fn<ReactionDataController['bootstrap']>()
    .mockResolvedValue(undefined);
  const destroyData = vi.fn<ReactionDataController['destroy']>();
  const destroyInteraction =
    vi.fn<ReactionInteractionController['destroy']>();
  const data = { bootstrap, destroy: destroyData };
  const interaction = {
    close: vi.fn(),
    destroy: destroyInteraction,
  };
  const tokenStore = {
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
  };
  const createApi = vi.fn<InitDependencies['createApi']>((baseUrl) => {
    createReactionApi(baseUrl, fetchImpl);
    return api;
  });
  const createData = vi
    .fn<InitDependencies['createData']>()
    .mockReturnValue(data);
  const createInteraction = vi
    .fn<InitDependencies['createInteraction']>()
    .mockReturnValue(interaction);
  const createTokenStore = vi
    .fn<InitDependencies['createTokenStore']>()
    .mockReturnValue(tokenStore);
  return {
    dependencies: {
      createApi, createData, createInteraction, createTokenStore,
    },
    fetchImpl,
    api,
    tokenStore,
    createApi,
    createData,
    createInteraction,
    createTokenStore,
    bootstrap,
    destroyData,
    destroyInteraction,
  };
}

function installHiddenMessage(): HTMLElement {
  document.body.innerHTML = '';
  const message = createReactionMessage({
    target: 'work:hidden',
    controlsHidden: true,
    actionsDisabled: true,
  });
  document.body.append(message);
  return message;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('reaction initializer', () => {
  it.each([
    undefined,
    '',
    '   ',
    'not a URL',
    'https://user:pass@reactions.example',
    'https://reactions.example/path',
    'https://reactions.example?query=1',
    'https://reactions.example#fragment',
    'http://reactions.example',
  ])('gracefully does nothing for invalid URL %j', async (apiUrl) => {
    const message = installHiddenMessage();
    const test = harness();
    const handle = await initReactions({
      apiUrl,
      root: document,
      dependencies: test.dependencies,
    });
    expect(handle).toBeUndefined();
    expect(test.createData).not.toHaveBeenCalled();
    expect(test.createInteraction).not.toHaveBeenCalled();
    expect(test.createTokenStore).not.toHaveBeenCalled();
    expect(test.bootstrap).not.toHaveBeenCalled();
    expect(test.fetchImpl).not.toHaveBeenCalled();
    expect(requiredElement<HTMLElement>(
      message,
      '[data-reaction-controls]',
    ).hidden).toBe(true);
    message.dispatchEvent(new Event('pointerenter'));
    expect(requiredElement<HTMLElement>(
      message,
      '[data-reaction-panel]',
    ).hidden).toBe(true);
  });

  it.each([
    'https://reactions.example',
    'https://reactions.example/',
    'http://localhost:4321',
    'http://127.0.0.1:4321/',
  ])('creates every dependency once and bootstraps for %s', async (apiUrl) => {
    installHiddenMessage();
    const test = harness();
    const handle = await initReactions({
      apiUrl,
      root: document,
      dependencies: test.dependencies,
    });
    expect(handle).toBeDefined();
    expect(test.createApi).toHaveBeenCalledTimes(1);
    expect(test.createApi).toHaveBeenCalledWith(apiUrl);
    expect(test.createTokenStore).toHaveBeenCalledTimes(1);
    expect(test.createInteraction).toHaveBeenCalledTimes(1);
    expect(test.createInteraction).toHaveBeenCalledWith({
      root: document,
    });
    expect(test.createData).toHaveBeenCalledTimes(1);
    expect(test.createData).toHaveBeenCalledWith({
      root: document,
      api: test.api,
      tokenStore: test.tokenStore,
    });
    expect(test.bootstrap).toHaveBeenCalledTimes(1);
  });

  it('does not open controls that are still hidden', async () => {
    const message = installHiddenMessage();
    const test = harness();
    const hover = createMediaQueryList(false);
    test.createInteraction.mockImplementation(({ root }) =>
      createReactionInteractionController({
        root,
        hoverMediaQuery: hover,
      })
    );
    const handle = await initReactions({
      apiUrl: 'https://reactions.example',
      root: document,
      dependencies: test.dependencies,
    });
    requiredElement<HTMLElement>(message, '.message-summary').click();
    await flushAsyncWork();
    expect(requiredElement<HTMLElement>(
      message,
      '[data-reaction-panel]',
    ).hidden).toBe(true);
    expect(message.classList.contains('is-reaction-open')).toBe(false);
    handle?.destroy();
  });

  it('destroys both controllers exactly once', async () => {
    installHiddenMessage();
    const test = harness();
    const handle = await initReactions({
      apiUrl: 'https://reactions.example',
      root: document,
      dependencies: test.dependencies,
    });
    handle?.destroy();
    handle?.destroy();
    expect(test.destroyData).toHaveBeenCalledTimes(1);
    expect(test.destroyInteraction).toHaveBeenCalledTimes(1);
  });

  it('uses safe storage and bootstraps when localStorage access throws', async () => {
    installHiddenMessage();
    const test = harness();
    const root = {
      get defaultView() {
        return {
          get localStorage(): Storage {
            throw new DOMException('blocked', 'SecurityError');
          },
        };
      },
    } as unknown as Document;
    test.createTokenStore.mockImplementation((storage) => {
      expect(storage.getItem('ignored')).toBeNull();
      expect(() =>
        storage.setItem('ignored', 'ignored'),
      ).not.toThrow();
      return createVisitorTokenStore(storage);
    });
    const handle = await initReactions({
      apiUrl: 'https://reactions.example',
      root,
      dependencies: test.dependencies,
    });
    expect(handle).toBeDefined();
    expect(test.createTokenStore).toHaveBeenCalledTimes(1);
    expect(test.bootstrap).toHaveBeenCalledTimes(1);
    const dataOptions = test.createData.mock.calls[0][0];
    expect(dataOptions.root).toBe(root);
    expect(dataOptions.api).toBe(test.api);
    expect(dataOptions.tokenStore).toEqual(expect.any(Object));
  });
});
