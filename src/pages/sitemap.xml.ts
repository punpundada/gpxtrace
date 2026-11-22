import type { APIRoute } from 'astro';
import { getSiteBaseUrl } from '../config/site';
import { loadAllTracks } from '../lib/tracks-loader';

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = getSiteBaseUrl(site);
  const tracks = await loadAllTracks();
  const latestDate = tracks[0]?.entry.data.date || '2026-03-10';

  const urls = [
    { loc: `${baseUrl}/`, lastmod: latestDate, priority: '1.0' },
    { loc: `${baseUrl}/upload/`, lastmod: latestDate, priority: '0.8' },
    ...tracks.map((t) => ({
      loc: `${baseUrl}/tracks/${t.slug}/`,
      lastmod: t.entry.data.date,
      priority: '0.9',
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
