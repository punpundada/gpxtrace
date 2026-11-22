import fs from 'node:fs/promises';
import path from 'node:path';
import { getCollection, type CollectionEntry } from 'astro:content';
import { parseGpxXml, type GpxTrackAnalysis } from './gpx';

export interface LoadedTrackEntry {
  entry: CollectionEntry<'tracks'>;
  slug: string;
  gpx: GpxTrackAnalysis;
  rawGpxXml: string;
}

export async function loadAllTracks(): Promise<LoadedTrackEntry[]> {
  const entries = await getCollection('tracks');
  const loaded: LoadedTrackEntry[] = [];

  for (const entry of entries) {
    const gpxPath = path.join(process.cwd(), 'public', 'gpx', entry.data.gpxFile);
    const rawGpxXml = await fs.readFile(gpxPath, 'utf-8');
    const gpx = parseGpxXml(rawGpxXml, entry.data.gpxFile);
    loaded.push({
      entry,
      slug: entry.id,
      gpx,
      rawGpxXml,
    });
  }

  return loaded.sort((a, b) => {
    if (a.entry.data.featured !== b.entry.data.featured) {
      return a.entry.data.featured ? -1 : 1;
    }
    return b.entry.data.date.localeCompare(a.entry.data.date);
  });
}
