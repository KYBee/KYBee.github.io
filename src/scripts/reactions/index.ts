import {
  createReactionApi,
  type ReactionApi,
} from './api-client';
import {
  createReactionDataController,
  type ReactionDataController,
} from './data-controller';
import {
  createReactionInteractionController,
  type ReactionInteractionController,
} from './interaction-controller';
import {
  createVisitorTokenStore,
  type VisitorTokenStore,
} from './token-store';

export interface ReactionsHandle {
  destroy(): void;
}

export interface InitDependencies {
  createApi(baseUrl: string): ReactionApi;
  createData(options: {
    root: Document;
    api: ReactionApi;
    tokenStore: VisitorTokenStore;
  }): ReactionDataController;
  createInteraction(options: {
    root: Document;
  }): ReactionInteractionController;
  createTokenStore(
    storage: Pick<Storage, 'getItem' | 'setItem'>,
  ): VisitorTokenStore;
}

const dependencies: InitDependencies = {
  createApi: createReactionApi,
  createData: createReactionDataController,
  createInteraction: createReactionInteractionController,
  createTokenStore: createVisitorTokenStore,
};

const unavailableStorage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: () => null,
  setItem: () => undefined,
};

export async function initReactions(options: {
  apiUrl?: string;
  root?: Document;
  dependencies?: InitDependencies;
}): Promise<ReactionsHandle | undefined> {
  const apiUrl = options.apiUrl;
  if (!apiUrl || apiUrl.trim().length === 0) return undefined;

  const root = options.root ?? document;
  const factories = options.dependencies ?? dependencies;
  let api: ReactionApi;
  try {
    api = factories.createApi(apiUrl);
  } catch {
    return undefined;
  }

  let storage: Pick<Storage, 'getItem' | 'setItem'> =
    unavailableStorage;
  try {
    storage = root.defaultView?.localStorage ?? unavailableStorage;
  } catch {
    storage = unavailableStorage;
  }

  const tokenStore = factories.createTokenStore(storage);
  const interactionController = factories.createInteraction({ root });
  const dataController = factories.createData({
    root,
    api,
    tokenStore,
  });
  void dataController.bootstrap().catch(() => undefined);

  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      dataController.destroy();
      interactionController.destroy();
    },
  };
}
