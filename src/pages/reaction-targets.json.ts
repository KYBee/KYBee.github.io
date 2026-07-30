import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getCurrentProjectEntries } from '../lib/project-groups';
import {
  createReactionTargetManifest,
  toReactionTargetId,
} from '../lib/reactions/targets';

export const prerender = true;

export const GET: APIRoute = async () => {
  const [projects, sideProjects] = await Promise.all([
    getCollection('projects'),
    getCollection('sideProjects'),
  ]);

  const workEntries = (['ko', 'en'] as const).flatMap((lang) =>
    getCurrentProjectEntries(
      projects.filter((entry) => entry.data.lang === lang),
    ),
  );

  const manifest = createReactionTargetManifest(
    workEntries
      .map((entry) => toReactionTargetId('projects', entry.id))
      .concat(
        sideProjects.map((entry) =>
          toReactionTargetId('sideProjects', entry.id),
        ),
      ),
  );

  return new Response(`${JSON.stringify(manifest)}\n`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
};
