import { SITE_CONFIG, SVG_CHART_CONFIG, withBase } from '../config/site';
import { escapeHtml, formatDuration, type GpxTrackAnalysis } from './gpx';

export interface SavedReviewRecord {
  id: string;
  title: string;
  subtitle: string;
  location: string;
  activity: string;
  difficulty: string;
  rating: number;
  surface: string;
  bestSeason: string;
  waterNotes: string;
  gearCallout: string;
  summary: string;
  body: string;
  gpx: GpxTrackAnalysis;
}

export function getSavedReviews(): SavedReviewRecord[] {
  const raw = localStorage.getItem(SITE_CONFIG.storageKeys.customReviews);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function findSavedReview(id: string): SavedReviewRecord | null {
  return getSavedReviews().find((item) => item.id === id) ?? null;
}

export function deleteSavedReview(id: string): void {
  const remaining = getSavedReviews().filter((item) => item.id !== id);
  localStorage.setItem(SITE_CONFIG.storageKeys.customReviews, JSON.stringify(remaining));
}

export function saveCustomReviewFromForm(form: HTMLFormElement, gpx: GpxTrackAnalysis): boolean {
  const fd = new FormData(form);
  const slug =
    String(fd.get('title') || 'custom-track')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'custom-track';

  const record: SavedReviewRecord = {
    id: `${slug}-${Date.now()}`,
    title: String(fd.get('title') || ''),
    subtitle: String(fd.get('subtitle') || ''),
    location: String(fd.get('location') || ''),
    activity: String(fd.get('activity') || 'Hiking'),
    difficulty: String(fd.get('difficulty') || 'Moderate'),
    rating: Number(fd.get('rating') || 4.8),
    surface: String(fd.get('surface') || ''),
    bestSeason: String(fd.get('bestSeason') || ''),
    waterNotes: String(fd.get('waterNotes') || ''),
    gearCallout: String(fd.get('gearCallout') || ''),
    summary: String(fd.get('summary') || ''),
    body: String(fd.get('body') || ''),
    gpx: {
      ...gpx,
      points: gpx.sampledPoints,
    },
  };

  try {
    const list = getSavedReviews();
    list.unshift(record);
    localStorage.setItem(SITE_CONFIG.storageKeys.customReviews, JSON.stringify(list.slice(0, 12)));
    return true;
  } catch {
    return false;
  }
}

export function downloadReviewMarkdown(form: HTMLFormElement, gpx: GpxTrackAnalysis): string {
  const fd = new FormData(form);
  const today = new Date().toISOString().slice(0, 10);
  const slug =
    gpx.filename
      .replace(/\.gpx$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') || 'track-review';

  const mdContent = `---
title: ${JSON.stringify(String(fd.get('title') || ''))}
subtitle: ${JSON.stringify(String(fd.get('subtitle') || ''))}
date: "${today}"
location: ${JSON.stringify(String(fd.get('location') || ''))}
activity: ${JSON.stringify(String(fd.get('activity') || 'Hiking'))}
difficulty: ${JSON.stringify(String(fd.get('difficulty') || 'Moderate'))}
rating: ${Number(fd.get('rating') || 4.8)}
gpxFile: ${JSON.stringify(gpx.filename)}
surface: ${JSON.stringify(String(fd.get('surface') || ''))}
bestSeason: ${JSON.stringify(String(fd.get('bestSeason') || ''))}
waterNotes: ${JSON.stringify(String(fd.get('waterNotes') || ''))}
gearCallout: ${JSON.stringify(String(fd.get('gearCallout') || ''))}
summary: ${JSON.stringify(String(fd.get('summary') || ''))}
featured: false
---

${String(fd.get('body') || '')}
`;

  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.md`;
  a.click();
  URL.revokeObjectURL(url);
  return `${slug}.md`;
}

export function createSavedReviewCard(item: SavedReviewRecord): HTMLElement {
  const article = document.createElement('article');
  article.className = 'track-card';
  article.dataset.trackCard = 'true';
  article.dataset.activity = String(item.activity || '');
  article.dataset.difficulty = String(item.difficulty || '');

  const { silhouetteWidth, silhouetteHeight } = SVG_CHART_CONFIG;
  const safeUrl = withBase(`/upload/?preview=${encodeURIComponent(String(item.id || ''))}`);
  const distKm = Number(item.gpx?.totalDistanceKm || 0);
  const gainM = Math.round(Number(item.gpx?.elevationGainM || 0));

  article.dataset.title = String(item.title || '').toLowerCase();
  article.dataset.location = String(item.location || '').toLowerCase();
  article.dataset.distance = String(distKm);
  article.dataset.gain = String(gainM);
  article.dataset.rating = String(Number(item.rating || 0));
  article.dataset.date = '9999-12-31';

  article.innerHTML = `
    <a href="${safeUrl}" class="track-card-preview">
      <div>
        <span class="badge badge-accent">${escapeHtml(String(item.activity || ''))} · Saved</span>
        <p class="stat-subtext font-mono tabular">${escapeHtml(String(item.gpx?.filename || ''))}</p>
      </div>
      <svg class="silhouette-svg" viewBox="0 0 ${silhouetteWidth} ${silhouetteHeight}" role="img" aria-label="Route trace">
        <path d="${escapeHtml(String(item.gpx?.silhouettePath || ''))}" class="silhouette-path"></path>
      </svg>
    </a>
    <div class="track-card-body">
      <div class="track-card-meta">
        <span class="badge">${escapeHtml(String(item.difficulty || ''))} · Effort ${Number(item.gpx?.effortScore || 0)}/100</span>
        <span class="badge badge-rating tabular">★ ${Number(item.rating || 0).toFixed(1)}</span>
      </div>
      <h3 class="track-card-title">
        <a href="${safeUrl}">${escapeHtml(String(item.title || ''))}</a>
      </h3>
      <p class="track-card-summary">${escapeHtml(String(item.summary || ''))}</p>
      <div class="track-card-stats tabular">
        <div class="mini-stat">
          <span class="mini-stat-label">Distance</span>
          <span class="mini-stat-val">
            <span data-unit-km="${distKm}" data-unit-decimals="2">${distKm.toFixed(2)}</span>
            <span data-unit-label="distance">km</span>
          </span>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-label">Climb</span>
          <span class="mini-stat-val">
            +<span data-unit-m="${gainM}">${gainM}</span>
            <span data-unit-label="elevation">m</span>
          </span>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-label">Moving Time</span>
          <span class="mini-stat-val">${formatDuration(Number(item.gpx?.movingDurationSec || 0))}</span>
        </div>
      </div>
      <div class="cockpit-controls">
        <a href="${safeUrl}" class="btn btn-secondary">
          <span>Open Saved Review</span>
        </a>
        <button type="button" class="btn btn-secondary" data-delete-review="${escapeHtml(String(item.id || ''))}">
          <span>Delete</span>
        </button>
      </div>
    </div>
  `;
  return article;
}
