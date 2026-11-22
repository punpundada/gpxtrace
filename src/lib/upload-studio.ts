import {
  downloadReviewMarkdown,
  findSavedReview,
  saveCustomReviewFromForm,
} from './custom-reviews';
import { formatDuration, parseGpxXml, type GpxTrackAnalysis } from './gpx';
import { mountTrackCockpit } from './map-controller';
import { applyUnitSystem, getActiveUnit } from './units';

export function updateAutomatedReviewDom(gpx: GpxTrackAnalysis): void {
  const panel = document.getElementById('studio-auto-review');
  if (!panel) return;

  const setText = (sel: string, val: string) => {
    const el = panel.querySelector<HTMLElement>(sel);
    if (el) el.textContent = val;
  };

  const setAttr = (sel: string, attr: string, val: string) => {
    const el = panel.querySelector<HTMLElement>(sel);
    if (el) el.setAttribute(attr, val);
  };

  setText('[data-auto-effort-score]', String(gpx.effortScore));
  setText('[data-auto-effort-cat]', `${gpx.effortCategory} Grade`);
  setText('[data-auto-verdict]', gpx.autoVerdict);
  setAttr('[data-auto-dist-val]', 'data-unit-km', String(gpx.totalDistanceKm));
  setText('[data-auto-points]', `${gpx.pointCount} GPS pts`);
  setAttr('[data-auto-gain-val]', 'data-unit-m', String(gpx.elevationGainM));
  setAttr('[data-auto-loss-val]', 'data-unit-m', String(gpx.elevationLossM));
  setAttr('[data-auto-max-ele]', 'data-unit-m', String(gpx.maxElevationM));
  setAttr('[data-auto-min-ele]', 'data-unit-m', String(gpx.minElevationM));
  setText('[data-auto-duration]', formatDuration(gpx.movingDurationSec));
  setAttr('[data-auto-speed]', 'data-unit-kmh', String(gpx.avgSpeedKmh));
  setText('[data-auto-crux-grade]', `${gpx.cruxSegment.avgGradePct.toFixed(1)}%`);
  setAttr('[data-auto-crux-start]', 'data-unit-km', String(gpx.cruxSegment.startKm));
  setAttr('[data-auto-crux-end]', 'data-unit-km', String(gpx.cruxSegment.endKm));
  setAttr('[data-auto-crux-gain]', 'data-unit-m', String(gpx.cruxSegment.gainM));
  setText('[data-auto-max-grade]', `${gpx.maxGradePct.toFixed(1)}%`);
  applyUnitSystem(getActiveUnit());

  const { gradeBreakdown } = gpx;
  const setRect = (sel: string, x: number, w: number) => {
    const r = panel.querySelector<SVGRectElement>(sel);
    if (r) {
      r.setAttribute('x', String(x));
      r.setAttribute('width', String(w));
    }
  };

  setRect('[data-rect-flat]', gradeBreakdown.flatX, gradeBreakdown.flatPct);
  setRect('[data-rect-rolling]', gradeBreakdown.rollingX, gradeBreakdown.rollingPct);
  setRect('[data-rect-steep]', gradeBreakdown.steepX, gradeBreakdown.steepPct);
  setRect('[data-rect-extreme]', gradeBreakdown.extremeX, gradeBreakdown.extremePct);

  setText('[data-pct-flat]', `${gradeBreakdown.flatPct}%`);
  setText('[data-pct-rolling]', `${gradeBreakdown.rollingPct}%`);
  setText('[data-pct-steep]', `${gradeBreakdown.steepPct}%`);
  setText('[data-pct-extreme]', `${gradeBreakdown.extremePct}%`);

  if (gpx.paceEstimates) {
    setText('[data-pace-casual]', formatDuration(gpx.paceEstimates.casualSec));
    setText('[data-pace-steady]', formatDuration(gpx.paceEstimates.steadySec));
    setText('[data-pace-fast]', formatDuration(gpx.paceEstimates.fastSec));
  }

  const titleEl = document.querySelector<HTMLElement>('#studio-cockpit [data-cockpit-title]');
  const fileEl = document.querySelector<HTMLElement>('#studio-cockpit [data-cockpit-filename]');
  const activeBadge = document.getElementById('active-gpx-badge');
  const previewEffort = document.getElementById('preview-effort');

  if (titleEl) titleEl.textContent = gpx.name;
  if (fileEl) fileEl.textContent = gpx.filename;
  if (activeBadge) activeBadge.textContent = gpx.filename;
  if (previewEffort) {
    previewEffort.textContent = `${gpx.effortScore} / 100 (${gpx.effortCategory})`;
  }
}

export function mountUploadStudio(): void {
  const starterEl = document.getElementById('starter-raw-gpx');
  const starterData = starterEl ? JSON.parse(starterEl.textContent || '{}') : null;

  const cockpitEl = document.getElementById('studio-cockpit');
  let currentGpxAnalysis: GpxTrackAnalysis | null = cockpitEl?.dataset.gpxPayload
    ? JSON.parse(cockpitEl.dataset.gpxPayload)
    : null;
  const cockpitController =
    cockpitEl && currentGpxAnalysis ? mountTrackCockpit(cockpitEl, currentGpxAnalysis) : null;

  const fileInput = document.getElementById('gpx-file-input') as HTMLInputElement | null;
  const dropzone = document.getElementById('gpx-dropzone');
  const loadSampleBtn = document.getElementById('load-sample-btn');
  const statusPanel = document.getElementById('upload-status-panel');
  const statusStep = document.getElementById('upload-status-step');
  const statusPct = document.getElementById('upload-status-pct');
  const progressRect = document.getElementById('upload-progress-rect');
  const toast = document.getElementById('feedback-toast');
  const toastText = document.getElementById('feedback-toast-text');
  const form = document.getElementById('review-editor-form') as HTMLFormElement | null;
  const exportBtn = document.getElementById('export-md-btn');

  function showToast(msg: string) {
    if (!toast || !toastText) return;
    toastText.textContent = msg;
    toast.dataset.visible = 'true';
    window.setTimeout(() => {
      toast.dataset.visible = 'false';
    }, 3200);
  }

  function setLoadingProgress(stepLabel: string, pct: number) {
    if (statusPanel) statusPanel.dataset.visible = 'true';
    if (statusStep) statusStep.textContent = stepLabel;
    if (statusPct) statusPct.textContent = `${pct}%`;
    if (progressRect) progressRect.setAttribute('width', String(pct));
  }

  function syncFormToPreview() {
    if (!form) return;
    const fd = new FormData(form);
    const setPreview = (id: string, val: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setPreview('preview-title', String(fd.get('title') || ''));
    setPreview('preview-subtitle', String(fd.get('subtitle') || ''));
    setPreview('preview-rating', `★ ${Number(fd.get('rating') || 4.8).toFixed(1)} / 5.0`);
    setPreview('preview-surface', String(fd.get('surface') || ''));
    setPreview('preview-water', String(fd.get('waterNotes') || ''));
    setPreview('preview-gear', String(fd.get('gearCallout') || ''));
    setPreview('preview-body', String(fd.get('body') || ''));
  }

  function setFormValue(id: string, val: string) {
    const el = document.getElementById(id) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | null;
    if (el) el.value = val;
  }

  async function processGpxString(xml: string, filename: string) {
    try {
      setLoadingProgress(`Reading ${filename}…`, 25);
      await new Promise((r) => window.setTimeout(r, 140));

      const parsed = parseGpxXml(xml, filename);
      setLoadingProgress(
        `Mapped ${parsed.pointCount} GPS points · Calculating climb & route summary…`,
        68,
      );
      await new Promise((r) => window.setTimeout(r, 160));

      currentGpxAnalysis = parsed;
      cockpitController?.updateTrack(parsed);
      updateAutomatedReviewDom(parsed);

      setFormValue(
        'field-title',
        `${parsed.name}: ${parsed.totalDistanceKm.toFixed(1)} km & +${parsed.elevationGainM}m Field Review`,
      );
      setFormValue('field-subtitle', parsed.autoVerdict);
      setFormValue('field-difficulty', parsed.effortCategory);
      setFormValue('field-summary', parsed.autoVerdict);

      syncFormToPreview();
      setLoadingProgress(
        `Ready! Plotted ${parsed.totalDistanceKm.toFixed(2)} km on the map with a full route breakdown.`,
        100,
      );
      showToast(`Loaded ${filename} (${parsed.pointCount} points)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid GPX file';
      setLoadingProgress(`Error: ${message}`, 100);
      showToast(message);
    }
  }

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    await processGpxString(await file.text(), file.name);
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.dataset.dragover = 'true';
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.dataset.dragover = 'false';
  });

  dropzone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.dataset.dragover = 'false';
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    await processGpxString(await file.text(), file.name);
  });

  loadSampleBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (starterData?.rawXml) {
      await processGpxString(starterData.rawXml, starterData.filename);
    }
  });

  form?.addEventListener('input', syncFormToPreview);

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form || !currentGpxAnalysis) return;
    const saved = saveCustomReviewFromForm(form, currentGpxAnalysis);
    showToast(
      saved
        ? 'Saved GPX track & review to your feed!'
        : 'Saved reviews list is full — download your review copy instead.',
    );
  });

  exportBtn?.addEventListener('click', () => {
    if (!form || !currentGpxAnalysis) return;
    const filename = downloadReviewMarkdown(form, currentGpxAnalysis);
    showToast(`Downloaded ${filename}`);
  });

  const previewId = new URLSearchParams(window.location.search).get('preview');
  const found = previewId ? findSavedReview(previewId) : null;
  if (found && found.gpx) {
    currentGpxAnalysis = found.gpx;
    cockpitController?.updateTrack(found.gpx);
    updateAutomatedReviewDom(found.gpx);
    setFormValue('field-title', found.title);
    setFormValue('field-subtitle', found.subtitle);
    setFormValue('field-location', found.location);
    setFormValue('field-activity', found.activity);
    setFormValue('field-difficulty', found.difficulty);
    setFormValue('field-rating', String(found.rating));
    setFormValue('field-surface', found.surface);
    setFormValue('field-season', found.bestSeason);
    setFormValue('field-water', found.waterNotes);
    setFormValue('field-gear', found.gearCallout);
    setFormValue('field-summary', found.summary);
    setFormValue('field-body', found.body);
    syncFormToPreview();
    showToast(`Loaded saved review: ${found.title}`);
  } else {
    syncFormToPreview();
  }
}
