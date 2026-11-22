import { GPX_THRESHOLDS, UNIT_FACTORS } from '../config/site';
import { buildElevationSvg, buildSilhouettePath } from './gpx-svg';

export interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
  timeMs: number | null;
  distKm: number;
  gradePct: number;
}

export interface SampledProfilePoint extends GpxPoint {
  svgX: number;
  svgY: number;
}

export interface GradeBreakdown {
  flatPct: number;
  rollingPct: number;
  steepPct: number;
  extremePct: number;
  flatX: number;
  rollingX: number;
  steepX: number;
  extremeX: number;
}

export interface CruxSegment {
  startKm: number;
  endKm: number;
  lengthKm: number;
  gainM: number;
  avgGradePct: number;
}

export interface GpxWaypoint {
  lat: number;
  lon: number;
  ele: number | null;
  name: string;
  desc: string;
}

export interface PaceEstimates {
  casualSec: number;
  steadySec: number;
  fastSec: number;
}

export interface GpxTrackAnalysis {
  name: string;
  filename: string;
  pointCount: number;
  points: GpxPoint[];
  sampledPoints: SampledProfilePoint[];
  waypoints: GpxWaypoint[];
  paceEstimates: PaceEstimates;
  totalDistanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  minElevationM: number;
  maxElevationM: number;
  movingDurationSec: number;
  avgSpeedKmh: number;
  maxGradePct: number;
  startCoord: [number, number];
  endCoord: [number, number];
  gradeBreakdown: GradeBreakdown;
  cruxSegment: CruxSegment;
  effortScore: number;
  effortCategory: 'Easy' | 'Moderate' | 'Hard' | 'Expert';
  autoVerdict: string;
  elevationLinePath: string;
  elevationAreaPath: string;
  cruxLinePath: string;
  cruxAreaPath: string;
  silhouettePath: string;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * UNIT_FACTORS.earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  );
}

export function parseGpxXml(xml: string, filename = 'track.gpx'): GpxTrackAnalysis {
  const xmlWithoutWpts = xml.replace(/<wpt\b[\s\S]*?<\/wpt>/gi, '');
  const nameMatch = xmlWithoutWpts.match(
    /<name>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/name>|<name>([^<]+)<\/name>/i,
  );
  const trackName = (nameMatch?.[1] || nameMatch?.[2] || filename.replace(/\.gpx$/i, '')).trim();

  // shortcut: regex parser handles standard <trkpt> and <rtept> nodes (including self-closing), upgrade if namespace-prefixed XML schemas are needed
  const ptRegex = /<(?:trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:trkpt|rtept)>)/gi;
  const rawPoints: Array<{ lat: number; lon: number; ele: number; timeMs: number | null }> = [];

  let match: RegExpExecArray | null;
  while ((match = ptRegex.exec(xml)) !== null) {
    const attrs = match[1] || '';
    const latMatch = attrs.match(/\blat=["']([^"']+)["']/i);
    const lonMatch = attrs.match(/\blon=["']([^"']+)["']/i);
    if (!latMatch || !lonMatch) continue;

    const lat = Number.parseFloat(latMatch[1]);
    const lon = Number.parseFloat(lonMatch[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const inner = match[2] || '';
    const eleMatch = inner.match(/<ele>([^<]+)<\/ele>/i);
    const timeMatch = inner.match(/<time>([^<]+)<\/time>/i);
    const ele = eleMatch ? Number.parseFloat(eleMatch[1]) : 0;
    const parsedTime = timeMatch ? Date.parse(timeMatch[1].trim()) : Number.NaN;

    rawPoints.push({
      lat,
      lon,
      ele: Number.isFinite(ele) ? ele : 0,
      timeMs: Number.isFinite(parsedTime) ? parsedTime : null,
    });
  }

  if (rawPoints.length === 0) {
    throw new Error(`No valid GPX trackpoints found in ${filename}`);
  }

  const wptRegex = /<wpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/wpt>)/gi;
  const waypoints: GpxWaypoint[] = [];
  let wptMatch: RegExpExecArray | null;
  while ((wptMatch = wptRegex.exec(xml)) !== null) {
    const attrs = wptMatch[1] || '';
    const latMatch = attrs.match(/\blat=["']([^"']+)["']/i);
    const lonMatch = attrs.match(/\blon=["']([^"']+)["']/i);
    if (!latMatch || !lonMatch) continue;
    const lat = Number.parseFloat(latMatch[1]);
    const lon = Number.parseFloat(lonMatch[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const inner = wptMatch[2] || '';
    const wNameMatch = inner.match(/<name>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/name>|<name>([^<]+)<\/name>/i);
    const wDescMatch = inner.match(/<desc>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/desc>|<desc>([^<]+)<\/desc>/i);
    const wEleMatch = inner.match(/<ele>([^<]+)<\/ele>/i);
    const wEle = wEleMatch ? Number.parseFloat(wEleMatch[1]) : Number.NaN;
    waypoints.push({
      lat,
      lon,
      ele: Number.isFinite(wEle) ? Math.round(wEle) : null,
      name: (wNameMatch?.[1] || wNameMatch?.[2] || 'Waypoint').trim(),
      desc: (wDescMatch?.[1] || wDescMatch?.[2] || '').trim(),
    });
  }

  const points: GpxPoint[] = [];
  let totalDistanceKm = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;
  let lastFilteredEle = rawPoints[0].ele;
  let minElevationM = rawPoints[0].ele;
  let maxElevationM = rawPoints[0].ele;
  let movingDurationSec = 0;
  let maxGradePct = 0;

  let minLat = rawPoints[0].lat;
  let maxLat = rawPoints[0].lat;
  let minLon = rawPoints[0].lon;
  let maxLon = rawPoints[0].lon;

  let flatDist = 0;
  let rollingDist = 0;
  let steepDist = 0;
  let extremeDist = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    const cur = rawPoints[i];
    minElevationM = Math.min(minElevationM, cur.ele);
    maxElevationM = Math.max(maxElevationM, cur.ele);
    minLat = Math.min(minLat, cur.lat);
    maxLat = Math.max(maxLat, cur.lat);
    minLon = Math.min(minLon, cur.lon);
    maxLon = Math.max(maxLon, cur.lon);

    let gradePct = 0;
    if (i > 0) {
      const prev = rawPoints[i - 1];
      const segKm = haversineKm(prev.lat, prev.lon, cur.lat, cur.lon);
      totalDistanceKm += segKm;

      const eleDiff = cur.ele - lastFilteredEle;
      if (Math.abs(eleDiff) >= GPX_THRESHOLDS.elevationNoiseFloorMeters) {
        if (eleDiff > 0) elevationGainM += eleDiff;
        else elevationLossM += Math.abs(eleDiff);
        lastFilteredEle = cur.ele;
      }

      if (segKm > 0.005) {
        const rawGrade = ((cur.ele - prev.ele) / (segKm * UNIT_FACTORS.metersPerKm)) * 100;
        gradePct = Math.max(-45, Math.min(45, rawGrade));
        maxGradePct = Math.max(maxGradePct, Math.abs(gradePct));
      }

      const absGrade = Math.abs(gradePct);
      if (absGrade < GPX_THRESHOLDS.gradeFlatMaxPct) flatDist += segKm;
      else if (absGrade < GPX_THRESHOLDS.gradeRollingMaxPct) rollingDist += segKm;
      else if (absGrade < GPX_THRESHOLDS.gradeSteepMaxPct) steepDist += segKm;
      else extremeDist += segKm;

      if (cur.timeMs !== null && prev.timeMs !== null && cur.timeMs > prev.timeMs) {
        const dtSec = (cur.timeMs - prev.timeMs) / 1000;
        const speedKmh = segKm / (dtSec / UNIT_FACTORS.secondsPerHour);
        if (speedKmh >= GPX_THRESHOLDS.movingSpeedFloorKmh) {
          movingDurationSec += dtSec;
        }
      }
    }

    points.push({
      lat: cur.lat,
      lon: cur.lon,
      ele: Math.round(cur.ele * 10) / 10,
      timeMs: cur.timeMs,
      distKm: Math.round(totalDistanceKm * 1000) / 1000,
      gradePct: Math.round(gradePct * 10) / 10,
    });
  }

  // Fallback estimated moving duration if GPX lacks timestamps (Naismith's rule)
  const { pace } = GPX_THRESHOLDS;
  const paceEstimates: PaceEstimates = {
    casualSec: Math.round(
      (totalDistanceKm / pace.casualSpeedKmh + elevationGainM / pace.casualClimbMPerHr) *
        UNIT_FACTORS.secondsPerHour,
    ),
    steadySec: Math.round(
      (totalDistanceKm / pace.steadySpeedKmh + elevationGainM / pace.steadyClimbMPerHr) *
        UNIT_FACTORS.secondsPerHour,
    ),
    fastSec: Math.round(
      (totalDistanceKm / pace.fastSpeedKmh + elevationGainM / pace.fastClimbMPerHr) *
        UNIT_FACTORS.secondsPerHour,
    ),
  };

  if (movingDurationSec <= 0 && totalDistanceKm > 0) {
    movingDurationSec = paceEstimates.steadySec;
  }

  const avgSpeedKmh =
    movingDurationSec > 0
      ? Math.round((totalDistanceKm / (movingDurationSec / UNIT_FACTORS.secondsPerHour)) * 10) / 10
      : 0;

  // Gradient breakdown percentages clamped so all 4 buckets always sum to 100%
  const safeTotal = totalDistanceKm > 0 ? totalDistanceKm : 1;
  const flatPct = Math.min(100, Math.round((flatDist / safeTotal) * 100));
  const rollingPct = Math.min(100 - flatPct, Math.round((rollingDist / safeTotal) * 100));
  const steepPct = Math.min(100 - flatPct - rollingPct, Math.round((steepDist / safeTotal) * 100));
  const extremePct = Math.max(0, 100 - flatPct - rollingPct - steepPct);

  const gradeBreakdown: GradeBreakdown = {
    flatPct,
    rollingPct,
    steepPct,
    extremePct,
    flatX: 0,
    rollingX: flatPct,
    steepX: flatPct + rollingPct,
    extremeX: flatPct + rollingPct + steepPct,
  };

  // Detect hardest sustained climb (crux segment)
  const cruxSegment = findCruxSegment(points);

  // Compute Effort Score (1-99)
  const rawEffort = Math.round(
    totalDistanceKm * GPX_THRESHOLDS.effortDistanceWeight +
      elevationGainM * GPX_THRESHOLDS.effortGainWeight +
      (steepPct + extremePct * 1.5) * GPX_THRESHOLDS.effortSteepWeight,
  );
  const effortScore = Math.max(
    GPX_THRESHOLDS.effortMinScore,
    Math.min(GPX_THRESHOLDS.effortMaxScore, rawEffort),
  );

  const effortCategory: GpxTrackAnalysis['effortCategory'] =
    effortScore >= GPX_THRESHOLDS.effortExpertMin
      ? 'Expert'
      : effortScore >= GPX_THRESHOLDS.effortHardMin
        ? 'Hard'
        : effortScore >= GPX_THRESHOLDS.effortModerateMin
          ? 'Moderate'
          : 'Easy';

  const steepCombined = steepPct + extremePct;
  const autoVerdict =
    cruxSegment.gainM > 20
      ? `${effortCategory}-grade route (${effortScore}/100 effort) with ${steepCombined}% of distance on steep (>8%) gradients. The crux pitch climbs +${Math.round(cruxSegment.gainM)} m between km ${cruxSegment.startKm.toFixed(1)} and km ${cruxSegment.endKm.toFixed(1)} at ${cruxSegment.avgGradePct.toFixed(1)}% average grade.`
      : `${effortCategory}-grade route (${effortScore}/100 effort) covering ${totalDistanceKm.toFixed(1)} km with mostly gentle gradients (${flatPct + rollingPct}% under 8% slope).`;

  const { sampledPoints, linePath, areaPath, cruxLinePath, cruxAreaPath } = buildElevationSvg(
    points,
    minElevationM,
    maxElevationM,
    cruxSegment,
  );
  const silhouettePath = buildSilhouettePath(points, minLat, maxLat, minLon, maxLon);

  return {
    name: trackName,
    filename,
    pointCount: points.length,
    points,
    sampledPoints,
    waypoints,
    paceEstimates,
    totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
    elevationGainM: Math.round(elevationGainM),
    elevationLossM: Math.round(elevationLossM),
    minElevationM: Math.round(minElevationM),
    maxElevationM: Math.round(maxElevationM),
    movingDurationSec: Math.round(movingDurationSec),
    avgSpeedKmh,
    maxGradePct: Math.round(maxGradePct * 10) / 10,
    startCoord: [points[0].lat, points[0].lon],
    endCoord: [points[points.length - 1].lat, points[points.length - 1].lon],
    gradeBreakdown,
    cruxSegment,
    effortScore,
    effortCategory,
    autoVerdict,
    elevationLinePath: linePath,
    elevationAreaPath: areaPath,
    cruxLinePath,
    cruxAreaPath,
    silhouettePath,
  };
}

function findCruxSegment(points: GpxPoint[]): CruxSegment {
  // Thin dense 1Hz points to at least cruxMinStepKm spacing so window scan stays fast
  const thinned: GpxPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = thinned[thinned.length - 1];
    if (!prev || i === points.length - 1 || points[i].distKm - prev.distKm >= GPX_THRESHOLDS.cruxMinStepKm) {
      thinned.push(points[i]);
    }
  }

  let best: CruxSegment = {
    startKm: 0,
    endKm: points[points.length - 1]?.distKm || 0,
    lengthKm: points[points.length - 1]?.distKm || 0,
    gainM: 0,
    avgGradePct: 0,
  };
  let bestScore = -1;

  for (let i = 0; i < thinned.length; i++) {
    for (let j = i + 1; j < thinned.length; j++) {
      const lengthKm = thinned[j].distKm - thinned[i].distKm;
      if (lengthKm < GPX_THRESHOLDS.cruxWindowMinKm) continue;
      if (lengthKm > 2.5) break;

      const gainM = thinned[j].ele - thinned[i].ele;
      if (gainM <= 0) continue;

      const avgGradePct = (gainM / (lengthKm * UNIT_FACTORS.metersPerKm)) * 100;
      const score = avgGradePct * Math.sqrt(gainM);
      if (score > bestScore) {
        bestScore = score;
        best = {
          startKm: Math.round(thinned[i].distKm * 100) / 100,
          endKm: Math.round(thinned[j].distKm * 100) / 100,
          lengthKm: Math.round(lengthKm * 100) / 100,
          gainM: Math.round(gainM),
          avgGradePct: Math.round(avgGradePct * 10) / 10,
        };
      }
    }
  }
  return best;
}

export function formatDuration(seconds: number): string {
  const totalMins = Math.round(seconds / UNIT_FACTORS.secondsPerMinute);
  const hrs = Math.floor(totalMins / UNIT_FACTORS.secondsPerMinute);
  const mins = totalMins % UNIT_FACTORS.secondsPerMinute;
  if (hrs <= 0) return `${mins}m`;
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}
