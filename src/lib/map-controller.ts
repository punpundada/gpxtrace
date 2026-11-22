import L from 'leaflet';
import { GPX_THRESHOLDS, MAP_CONFIG, SITE_CONFIG, UNIT_FACTORS, UNIT_LABELS } from '../config/site';
import {
  escapeHtml,
  type GpxTrackAnalysis,
  type GpxWaypoint,
  type SampledProfilePoint,
} from './gpx';
import { formatDistanceByUnit, formatElevationByUnit, getActiveUnit } from './units';

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface CockpitInstance {
  updateTrack: (analysis: GpxTrackAnalysis) => void;
}

const cockpitRegistry = new WeakMap<HTMLElement, CockpitInstance>();

export function mountTrackCockpit(
  root: HTMLElement,
  initialAnalysis?: GpxTrackAnalysis,
): CockpitInstance {
  const existing = cockpitRegistry.get(root);
  if (existing) {
    return existing;
  }

  const mapEl = root.querySelector<HTMLElement>('[data-map-canvas]');
  const loadingOverlay = root.querySelector<HTMLElement>('[data-loading-overlay]');
  const loadingText = root.querySelector<HTMLElement>('[data-loading-text]');
  const svgWrap = root.querySelector<HTMLElement>('[data-elevation-wrap]');
  const cursorLine = root.querySelector<SVGLineElement>('[data-ele-cursor-line]');
  const cursorDot = root.querySelector<SVGCircleElement>('[data-ele-cursor-dot]');
  const areaPathEl = root.querySelector<SVGPathElement>('[data-ele-area]');
  const linePathEl = root.querySelector<SVGPathElement>('[data-ele-line]');
  const cruxAreaPathEl = root.querySelector<SVGPathElement>('[data-ele-crux-area]');
  const cruxLinePathEl = root.querySelector<SVGPathElement>('[data-ele-crux-line]');
  const liveDistEl = root.querySelector<HTMLElement>('[data-live-dist]');
  const liveEleEl = root.querySelector<HTMLElement>('[data-live-ele]');
  const liveGradeEl = root.querySelector<HTMLElement>('[data-live-grade]');
  const liveCoordEl = root.querySelector<HTMLElement>('[data-live-coord]');
  const fitBtn = root.querySelector<HTMLButtonElement>('[data-fit-bounds]');
  const gradientBtn = root.querySelector<HTMLButtonElement>('[data-toggle-gradient]');
  const cruxBtn = root.querySelector<HTMLButtonElement>('[data-toggle-crux]');
  const layerBtns = root.querySelectorAll<HTMLButtonElement>('[data-layer-btn]');

  if (!mapEl) {
    throw new Error('Map canvas element missing in cockpit container');
  }

  const map = L.map(mapEl, {
    scrollWheelZoom: false,
    zoomControl: false,
  });

  const ZoomButtons = L.Control.extend({
    options: { position: 'topleft' as L.ControlPosition },
    onAdd() {
      const container = L.DomUtil.create('div', 'leaflet-control-zoom leaflet-bar');
      const createBtn = (label: string, title: string, onClick: () => void) => {
        const btn = L.DomUtil.create('button', 'leaflet-zoom-btn', container);
        btn.type = 'button';
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.textContent = label;
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, 'click', onClick);
      };
      createBtn('+', 'Zoom in', () => map.zoomIn());
      createBtn('−', 'Zoom out', () => map.zoomOut());
      return container;
    },
  });
  new ZoomButtons().addTo(map);

  const osmLayer = L.tileLayer(MAP_CONFIG.layers.osm.url, {
    attribution: MAP_CONFIG.layers.osm.attribution,
    maxZoom: MAP_CONFIG.layers.osm.maxZoom,
  });

  const topoLayer = L.tileLayer(MAP_CONFIG.layers.topo.url, {
    attribution: MAP_CONFIG.layers.topo.attribution,
    maxZoom: MAP_CONFIG.layers.topo.maxZoom,
  });

  osmLayer.addTo(map);

  const markLoaded = () => {
    if (loadingOverlay) {
      loadingOverlay.dataset.loaded = 'true';
    }
  };

  osmLayer.once('load', markLoaded);
  window.setTimeout(markLoaded, 900);

  const featureGroup = L.featureGroup().addTo(map);
  const splitsGroup = L.layerGroup().addTo(map);
  let hoverMarker: L.CircleMarker | null = null;
  let cruxLayer: L.Polyline | null = null;
  let waypointEntries: Array<{ marker: L.CircleMarker; wpt: GpxWaypoint }> = [];
  let currentAnalysis: GpxTrackAnalysis | null = initialAnalysis ?? null;
  let activeSample: SampledProfilePoint | undefined = initialAnalysis?.sampledPoints[0];
  let gradientMode = false;
  let cruxMode = false;

  const getColorForGrade = (gradePct: number): string => {
    const abs = Math.abs(gradePct);
    if (abs < GPX_THRESHOLDS.gradeFlatMaxPct) return getCssVar(SITE_CONFIG.cssVars.gradeFlat);
    if (abs < GPX_THRESHOLDS.gradeRollingMaxPct) return getCssVar(SITE_CONFIG.cssVars.gradeRolling);
    if (abs < GPX_THRESHOLDS.gradeSteepMaxPct) return getCssVar(SITE_CONFIG.cssVars.gradeSteep);
    return getCssVar(SITE_CONFIG.cssVars.gradeExtreme);
  };

  const formatWaypointTooltip = (wpt: GpxWaypoint, unit: 'metric' | 'imperial'): string => {
    const eleLabel = wpt.ele !== null ? ` · ${formatElevationByUnit(wpt.ele, unit)}` : '';
    const descLabel = wpt.desc ? `<br/><span>${escapeHtml(wpt.desc)}</span>` : '';
    return `<strong>${escapeHtml(wpt.name)}</strong>${eleLabel}${descLabel}`;
  };

  const renderDistanceSplits = () => {
    splitsGroup.clearLayers();
    if (!currentAnalysis || currentAnalysis.points.length < 2) return;
    const unit = getActiveUnit();
    const factor = unit === 'imperial' ? UNIT_FACTORS.kmToMi : 1;
    const labelUnit = UNIT_LABELS[unit].distance;
    const totalUnits = currentAnalysis.totalDistanceKm * factor;
    const stepUnits = totalUnits > 20 ? 5 : totalUnits > 10 ? 2 : 1;

    let nextMark = stepUnits;
    for (const pt of currentAnalysis.points) {
      const distInUnit = pt.distKm * factor;
      if (distInUnit >= nextMark && totalUnits - distInUnit > stepUnits * 0.25) {
        const markVal = nextMark;
        const icon = L.divIcon({
          className: 'map-split-icon',
          html: `<span class="map-split-marker tabular">${markVal}</span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        L.marker([pt.lat, pt.lon], { icon, interactive: true })
          .bindTooltip(
            `${markVal} ${labelUnit} · ${formatElevationByUnit(pt.ele, unit)}`,
            { direction: 'top' },
          )
          .addTo(splitsGroup);
        nextMark += stepUnits;
      }
    }
  };

  const refreshMapUnitLabels = () => {
    const unit = getActiveUnit();
    for (const { marker, wpt } of waypointEntries) {
      marker.setTooltipContent(formatWaypointTooltip(wpt, unit));
    }
    if (cruxLayer && currentAnalysis) {
      const { cruxSegment } = currentAnalysis;
      cruxLayer.setTooltipContent(
        `Crux Climb: +${formatElevationByUnit(cruxSegment.gainM, unit)} (${cruxSegment.avgGradePct.toFixed(1)}% avg)`,
      );
    }
    renderDistanceSplits();
  };

  const renderTrackOnMap = (analysis: GpxTrackAnalysis, preserveViewport = false) => {
    currentAnalysis = analysis;
    featureGroup.clearLayers();
    splitsGroup.clearLayers();
    cruxLayer = null;
    waypointEntries = [];

    if (loadingText) {
      loadingText.textContent = `Drawing route on the map…`;
    }

    const accentColor = getCssVar(SITE_CONFIG.cssVars.accent);
    const surfaceColor = getCssVar(SITE_CONFIG.cssVars.surfaceElevated);
    const startColor = getCssVar(SITE_CONFIG.cssVars.markerStart);
    const endColor = getCssVar(SITE_CONFIG.cssVars.markerEnd);
    const extremeColor = getCssVar(SITE_CONFIG.cssVars.gradeExtreme);
    const rollingColor = getCssVar(SITE_CONFIG.cssVars.gradeRolling);

    const latLngs: L.LatLngExpression[] = analysis.points.map((pt) => [pt.lat, pt.lon]);

    // White high-contrast casing
    L.polyline(latLngs, {
      color: surfaceColor,
      weight: MAP_CONFIG.casingWeight,
      opacity: 0.92,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(featureGroup);

    if (gradientMode && analysis.points.length > 1) {
      // Batch consecutive segments that share the same slope color bucket
      let runColor = getColorForGrade(analysis.points[1].gradePct);
      let runCoords: L.LatLngExpression[] = [
        [analysis.points[0].lat, analysis.points[0].lon],
        [analysis.points[1].lat, analysis.points[1].lon],
      ];

      for (let i = 2; i < analysis.points.length; i++) {
        const pt = analysis.points[i];
        const col = getColorForGrade(pt.gradePct);
        if (col === runColor) {
          runCoords.push([pt.lat, pt.lon]);
        } else {
          L.polyline(runCoords, {
            color: runColor,
            weight: MAP_CONFIG.trackWeight,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(featureGroup);
          const prev = analysis.points[i - 1];
          runColor = col;
          runCoords = [
            [prev.lat, prev.lon],
            [pt.lat, pt.lon],
          ];
        }
      }
      L.polyline(runCoords, {
        color: runColor,
        weight: MAP_CONFIG.trackWeight,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(featureGroup);
    } else {
      L.polyline(latLngs, {
        color: accentColor,
        weight: MAP_CONFIG.trackWeight,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(featureGroup);
    }

    // Highlight Crux segment on map if active
    const unit = getActiveUnit();
    const { cruxSegment } = analysis;
    if (cruxSegment.gainM > 0) {
      const cruxPts = analysis.points.filter(
        (p) => p.distKm >= cruxSegment.startKm && p.distKm <= cruxSegment.endKm,
      );
      if (cruxPts.length >= 2) {
        const cruxLatLngs: L.LatLngExpression[] = cruxPts.map((p) => [p.lat, p.lon]);
        cruxLayer = L.polyline(cruxLatLngs, {
          color: extremeColor,
          weight: MAP_CONFIG.casingWeight + 1,
          opacity: cruxMode ? 0.95 : 0,
          lineCap: 'round',
          lineJoin: 'round',
        })
          .bindTooltip(
            `Crux Climb: +${formatElevationByUnit(cruxSegment.gainM, unit)} (${cruxSegment.avgGradePct.toFixed(1)}% avg)`,
            { direction: 'top' },
          )
          .addTo(featureGroup);
      }
    }

    // GPX Waypoints (<wpt> POIs)
    for (const wpt of analysis.waypoints || []) {
      const marker = L.circleMarker([wpt.lat, wpt.lon], {
        radius: MAP_CONFIG.waypointRadius,
        fillColor: rollingColor,
        color: surfaceColor,
        weight: 2,
        fillOpacity: 1,
      })
        .bindTooltip(formatWaypointTooltip(wpt, unit), { direction: 'top' })
        .addTo(featureGroup);
      waypointEntries.push({ marker, wpt });
    }

    // Start & Finish markers
    L.circleMarker(analysis.startCoord, {
      radius: MAP_CONFIG.markerRadius,
      fillColor: startColor,
      color: surfaceColor,
      weight: 2.5,
      fillOpacity: 1,
    })
      .bindTooltip('Start', { direction: 'top' })
      .addTo(featureGroup);

    L.circleMarker(analysis.endCoord, {
      radius: MAP_CONFIG.markerRadius,
      fillColor: endColor,
      color: surfaceColor,
      weight: 2.5,
      fillOpacity: 1,
    })
      .bindTooltip('Finish', { direction: 'top' })
      .addTo(featureGroup);

    hoverMarker = L.circleMarker(analysis.startCoord, {
      radius: MAP_CONFIG.hoverMarkerRadius,
      fillColor: accentColor,
      color: surfaceColor,
      weight: 3,
      fillOpacity: 0,
      opacity: 0,
    }).addTo(featureGroup);

    renderDistanceSplits();

    if (areaPathEl) areaPathEl.setAttribute('d', analysis.elevationAreaPath);
    if (linePathEl) linePathEl.setAttribute('d', analysis.elevationLinePath);
    if (cruxAreaPathEl) cruxAreaPathEl.setAttribute('d', analysis.cruxAreaPath || '');
    if (cruxLinePathEl) cruxLinePathEl.setAttribute('d', analysis.cruxLinePath || '');
    if (svgWrap) svgWrap.dataset.crux = String(cruxMode);

    if (!preserveViewport) {
      const bounds = featureGroup.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: MAP_CONFIG.fitBoundsPadding });
      }
    }

    const firstSample = analysis.sampledPoints[0];
    if (firstSample) {
      updateHoverReadout(firstSample, false);
    }
    markLoaded();
  };

  const updateHoverReadout = (pt: SampledProfilePoint, showMarker: boolean) => {
    activeSample = pt;
    const unit = getActiveUnit();
    if (liveDistEl) liveDistEl.textContent = formatDistanceByUnit(pt.distKm, unit);
    if (liveEleEl) liveEleEl.textContent = formatElevationByUnit(pt.ele, unit);
    if (liveGradeEl) {
      const sign = pt.gradePct > 0 ? '+' : '';
      liveGradeEl.textContent = `${sign}${pt.gradePct.toFixed(1)}%`;
    }
    if (liveCoordEl) {
      liveCoordEl.textContent = `${pt.lat.toFixed(4)}, ${pt.lon.toFixed(4)}`;
    }
    if (cursorLine) {
      cursorLine.setAttribute('x1', String(pt.svgX));
      cursorLine.setAttribute('x2', String(pt.svgX));
    }
    if (cursorDot) {
      cursorDot.setAttribute('cx', String(pt.svgX));
      cursorDot.setAttribute('cy', String(pt.svgY));
    }
    if (hoverMarker) {
      hoverMarker.setLatLng([pt.lat, pt.lon]);
      hoverMarker.setStyle({
        fillOpacity: showMarker ? 1 : 0,
        opacity: showMarker ? 1 : 0,
      });
    }
  };

  if (svgWrap) {
    const getSampleAtClientX = (clientX: number): SampledProfilePoint | null => {
      if (!currentAnalysis || currentAnalysis.sampledPoints.length === 0) return null;
      const rect = svgWrap.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      const idx = Math.min(
        currentAnalysis.sampledPoints.length - 1,
        Math.round(ratio * (currentAnalysis.sampledPoints.length - 1)),
      );
      return currentAnalysis.sampledPoints[idx];
    };

    svgWrap.addEventListener('pointermove', (e) => {
      const pt = getSampleAtClientX(e.clientX);
      if (!pt) return;
      svgWrap.dataset.active = 'true';
      updateHoverReadout(pt, true);
    });

    svgWrap.addEventListener('click', (e) => {
      const pt = getSampleAtClientX(e.clientX);
      if (!pt) return;
      svgWrap.dataset.active = 'true';
      updateHoverReadout(pt, true);
      map.panTo([pt.lat, pt.lon], { animate: true });
    });

    svgWrap.addEventListener('pointerleave', () => {
      svgWrap.dataset.active = 'false';
      if (hoverMarker) {
        hoverMarker.setStyle({ fillOpacity: 0, opacity: 0 });
      }
    });
  }

  gradientBtn?.addEventListener('click', () => {
    gradientMode = !gradientMode;
    gradientBtn.setAttribute('aria-pressed', String(gradientMode));
    if (currentAnalysis) {
      renderTrackOnMap(currentAnalysis, true);
    }
  });

  cruxBtn?.addEventListener('click', () => {
    cruxMode = !cruxMode;
    cruxBtn.setAttribute('aria-pressed', String(cruxMode));
    if (svgWrap) svgWrap.dataset.crux = String(cruxMode);
    if (cruxLayer) {
      cruxLayer.setStyle({ opacity: cruxMode ? 0.95 : 0 });
      if (cruxMode) {
        const cBounds = cruxLayer.getBounds();
        if (cBounds.isValid()) {
          map.fitBounds(cBounds, { padding: MAP_CONFIG.fitBoundsPadding });
        }
      }
    }
  });

  layerBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const layerType = btn.dataset.layerBtn;
      layerBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      if (layerType === MAP_CONFIG.layers.topo.id) {
        map.removeLayer(osmLayer);
        topoLayer.addTo(map);
      } else {
        map.removeLayer(topoLayer);
        osmLayer.addTo(map);
      }
    });
  });

  fitBtn?.addEventListener('click', () => {
    const bounds = featureGroup.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: MAP_CONFIG.fitBoundsPadding });
    }
  });

  window.addEventListener('gpxtrace:unit-change', () => {
    refreshMapUnitLabels();
    const pt = activeSample ?? currentAnalysis?.sampledPoints[0];
    if (pt) {
      updateHoverReadout(pt, false);
    }
  });

  if (initialAnalysis) {
    renderTrackOnMap(initialAnalysis);
  }

  const instance: CockpitInstance = {
    updateTrack: (analysis: GpxTrackAnalysis) => renderTrackOnMap(analysis, false),
  };
  cockpitRegistry.set(root, instance);
  return instance;
}
