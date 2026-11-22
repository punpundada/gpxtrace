import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { ACTIVITY_TYPES, DIFFICULTY_LEVELS } from './config/site';

const tracks = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tracks' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string(),
    date: z.string(),
    location: z.string(),
    activity: z.enum(ACTIVITY_TYPES),
    difficulty: z.enum(DIFFICULTY_LEVELS),
    rating: z.number().min(1).max(5),
    gpxFile: z.string(),
    surface: z.string(),
    bestSeason: z.string(),
    waterNotes: z.string(),
    gearCallout: z.string(),
    summary: z.string(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { tracks };
