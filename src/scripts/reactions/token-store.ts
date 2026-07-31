export const VISITOR_TOKEN_STORAGE_KEY =
  'kybee:project-reactions:visitor-token:v1';

export interface VisitorTokenStore {
  get(): string | undefined;
  set(token: string): void;
}

export function createVisitorTokenStore(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): VisitorTokenStore {
  return {
    get() {
      try {
        const token = storage.getItem(VISITOR_TOKEN_STORAGE_KEY);
        return token && token.length > 0 ? token : undefined;
      } catch {
        return undefined;
      }
    },
    set(token) {
      if (token.length === 0) return;
      try {
        storage.setItem(VISITOR_TOKEN_STORAGE_KEY, token);
      } catch {
        // The controller keeps the token in memory for this page lifetime.
      }
    },
  };
}
