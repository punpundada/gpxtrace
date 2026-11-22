import type { APIRoute } from 'astro';
import { getSiteBaseUrl, SITE_CONFIG } from '../config/site';
import { escapeHtml } from '../lib/gpx';
import { loadAllTracks } from '../lib/tracks-loader';

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = getSiteBaseUrl(site);
  const tracks = await loadAllTracks();

  const itemsXml = tracks
    .map((t) => {
      const link = `${baseUrl}/tracks/${t.slug}/`;
      const pubDate = new Date(`${t.entry.data.date}T00:00:00Z`).toUTCString();
      const desc = `${t.entry.data.summary} (${t.gpx.totalDistanceKm.toFixed(2)} km, +${t.gpx.elevationGainM}m climb, Effort ${t.gpx.effortScore}/100)`;
      return `    <item>
      <title>${escapeHtml(t.entry.data.title)}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeHtml(t.entry.data.activity)}</category>
      <description>${escapeHtml(desc)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(SITE_CONFIG.name)} — ${escapeHtml(SITE_CONFIG.tagline)}</title>
    <link>${baseUrl}/</link>
    <description>${escapeHtml(SITE_CONFIG.heroSubheadline)}</description>
    <language>en-us</language>
${itemsXml}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
