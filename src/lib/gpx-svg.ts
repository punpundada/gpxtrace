import { GPX_THRESHOLDS, SVG_CHART_CONFIG } from '../config/site';
import type { CruxSegment, GpxPoint, SampledProfilePoint } from './gpx';

export function buildElevationSvg(
  points: GpxPoint[],
  minEle: number,
  maxEle: number,
  cruxSegment?: CruxSegment,
): {
  sampledPoints: SampledProfilePoint[];
  linePath: string;
  areaPath: string;
  cruxLinePath: string;
  cruxAreaPath: string;
} {
  const { profileWidth, profileHeight, padTop, padBottom, padLeft, padRight } = SVG_CHART_CONFIG;
  const usableW = profileWidth - padLeft - padRight;
  const usableH = profileHeight - padTop - padBottom;

  const targetCount = Math.min(points.length, GPX_THRESHOLDS.profileSampleCount);
  const step = Math.max(1, (points.length - 1) / Math.max(1, targetCount - 1));
  const sampled: SampledProfilePoint[] = [];

  const totalDist = points[points.length - 1]?.distKm || 1;
  const eleSpan = Math.max(10, maxEle - minEle);

  for (let k = 0; k < targetCount; k++) {
    const idx = k === targetCount - 1 ? points.length - 1 : Math.round(k * step);
    const pt = points[idx];
    const xRatio = totalDist > 0 ? pt.distKm / totalDist : k / Math.max(1, targetCount - 1);
    const yRatio = (pt.ele - minEle) / eleSpan;
    const svgX = Math.round((padLeft + xRatio * usableW) * 10) / 10;
    const svgY = Math.round((padTop + usableH - yRatio * usableH) * 10) / 10;
    sampled.push({ ...pt, svgX, svgY });
  }

  const lineCoords = sampled.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.svgX},${p.svgY}`).join(' ');
  const firstX = sampled[0]?.svgX ?? padLeft;
  const lastX = sampled[sampled.length - 1]?.svgX ?? profileWidth - padRight;
  const baselineY = profileHeight - padBottom;
  const areaPath = `${lineCoords} L${lastX},${baselineY} L${firstX},${baselineY} Z`;

  let cruxLinePath = '';
  let cruxAreaPath = '';
  if (cruxSegment && cruxSegment.gainM > 0) {
    const cruxPts = sampled.filter(
      (p) => p.distKm >= cruxSegment.startKm - 0.05 && p.distKm <= cruxSegment.endKm + 0.05,
    );
    if (cruxPts.length >= 2) {
      cruxLinePath = cruxPts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.svgX},${p.svgY}`).join(' ');
      const cFirstX = cruxPts[0].svgX;
      const cLastX = cruxPts[cruxPts.length - 1].svgX;
      cruxAreaPath = `${cruxLinePath} L${cLastX},${baselineY} L${cFirstX},${baselineY} Z`;
    }
  }

  return { sampledPoints: sampled, linePath: lineCoords, areaPath, cruxLinePath, cruxAreaPath };
}

export function buildSilhouettePath(
  points: GpxPoint[],
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
): string {
  const { silhouetteWidth, silhouetteHeight, silhouettePad } = SVG_CHART_CONFIG;
  const usableW = silhouetteWidth - silhouettePad * 2;
  const usableH = silhouetteHeight - silhouettePad * 2;
  const latSpan = Math.max(0.0005, maxLat - minLat);
  const lonSpan = Math.max(0.0005, maxLon - minLon);

  const count = Math.min(points.length, GPX_THRESHOLDS.silhouetteSampleCount);
  const step = Math.max(1, (points.length - 1) / Math.max(1, count - 1));
  const parts: string[] = [];

  for (let i = 0; i < count; i++) {
    const idx = i === count - 1 ? points.length - 1 : Math.round(i * step);
    const pt = points[idx];
    const x = silhouettePad + ((pt.lon - minLon) / lonSpan) * usableW;
    const y = silhouettePad + usableH - ((pt.lat - minLat) / latSpan) * usableH;
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return parts.join(' ');
}
