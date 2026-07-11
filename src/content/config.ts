import { defineCollection, z } from 'astro:content';

const langEnum = z.enum(['ko', 'en']);

const projects = defineCollection({
  type: 'data',
  schema: z.object({
    company: z.string(),
    role: z.string(),
    period: z.string(),
    location: z.string().optional(),
    title: z.string().optional(),
    summary: z.string().optional(),
    bullets: z.array(z.string()).max(4).optional(),
    metric: z.string().optional(),
    tags: z.array(z.string()).default([]),
    lang: langEnum,
    order: z.number(),
  }),
});

const sideProjects = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    tech: z.string(),
    description: z.string(),
    url: z.string().url().optional(),
    badge: z.string().optional(),
    lang: langEnum,
    order: z.number(),
  }),
});

const about = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    title: z.string(),
    tagline: z.string(),
    location: z.string(),
    links: z.object({
      github: z.string().url(),
      blog: z.string().url(),
      linkedin: z.string().url(),
      email: z.string().email(),
    }),
    bullets: z.array(z.string()),
    activities: z.string().optional(),
    lang: langEnum,
  }),
});

const education = defineCollection({
  type: 'data',
  schema: z.object({
    school: z.string(),
    department: z.string(),
    period: z.string(),
    detail: z.string(),
    courses: z
      .array(
        z.object({
          category: z.string(),
          items: z.array(z.string()),
        })
      )
      .optional(),
    languages: z.string().optional(),
    lang: langEnum,
    order: z.number(),
  }),
});

const certifications = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    date: z.string().optional(),
    lang: langEnum,
    order: z.number(),
  }),
});

const skills = defineCollection({
  type: 'data',
  schema: z.object({
    category: z.string(),
    items: z.array(z.string()),
    lang: langEnum,
    order: z.number(),
  }),
});

export const collections = {
  projects,
  sideProjects,
  about,
  education,
  certifications,
  skills,
};
