import type { Env } from './env';
const worker: ExportedHandler<Env> = {
  fetch() {
    return new Response('Reaction service is not ready', { status: 503 });
  },
};
export default worker;
