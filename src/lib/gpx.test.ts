import assert from 'node:assert/strict';
import { escapeHtml, formatDuration, haversineKm, parseGpxXml } from './gpx';

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPXTraceTest">
  <wpt lat="32.2465" lon="76.3280"><ele>2165</ele><name>Spring Refill</name><desc>Cold water pipe</desc></wpt>
  <trk>
    <name>Test Alpine Switchbacks</name>
    <trkseg>
      <trkpt lat="32.2432" lon="76.3242"><ele>2100</ele><time>2026-05-10T06:00:00Z</time></trkpt>
      <trkpt lat="32.2465" lon="76.3280"><ele>2165</ele><time>2026-05-10T06:15:00Z</time></trkpt>
      <trkpt lat="32.2500" lon="76.3325"><ele>2245</ele><time>2026-05-10T06:35:00Z</time></trkpt>
      <trkpt lat="32.2538" lon="76.3360"><ele>2340</ele><time>2026-05-10T06:55:00Z</time></trkpt>
      <trkpt lat="32.2570" lon="76.3400"><ele>2315</ele><time>2026-05-10T07:10:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const result = parseGpxXml(sampleXml, 'test-alpine.gpx');

assert.equal(result.name, 'Test Alpine Switchbacks');
assert.equal(result.pointCount, 5);
assert.ok(result.totalDistanceKm > 1.8 && result.totalDistanceKm < 2.6, `Unexpected distance: ${result.totalDistanceKm}`);
assert.equal(result.elevationGainM, 240);
assert.equal(result.elevationLossM, 25);
assert.equal(result.minElevationM, 2100);
assert.equal(result.maxElevationM, 2340);
assert.equal(result.movingDurationSec, 4200);
assert.ok(result.cruxSegment.gainM >= 150, `Expected crux gain >= 150m, got ${result.cruxSegment.gainM}`);
assert.equal(
  result.gradeBreakdown.flatPct +
    result.gradeBreakdown.rollingPct +
    result.gradeBreakdown.steepPct +
    result.gradeBreakdown.extremePct,
  100,
);
assert.ok(result.elevationLinePath.startsWith('M'));
assert.ok(result.cruxLinePath.startsWith('M'));
assert.ok(result.cruxAreaPath.endsWith('Z'));
assert.equal(result.waypoints.length, 1);
assert.equal(result.waypoints[0].name, 'Spring Refill');
assert.equal(result.waypoints[0].ele, 2165);
assert.ok(
  result.paceEstimates.casualSec > result.paceEstimates.steadySec &&
    result.paceEstimates.steadySec > result.paceEstimates.fastSec,
);
assert.ok(result.silhouettePath.startsWith('M'));
assert.equal(formatDuration(4200), '1h 10m');
assert.equal(formatDuration(7175), '2h 00m');
assert.ok(haversineKm(0, 0, 0, 1) > 110 && haversineKm(0, 0, 0, 1) < 112);

// Edge case: lon before lat, self-closing <trkpt/>, no <time> or <ele>
const reversedSelfClosingXml = `<gpx><trk><trkseg>
  <trkpt lon="76.3242" lat="32.2432"/>
  <trkpt lon="76.3280" lat="32.2465"/>
  <trkpt lon="76.3325" lat="32.2500"><ele>100</ele></trkpt>
</trkseg></trk></gpx>`;
const reversedResult = parseGpxXml(reversedSelfClosingXml, 'reversed.gpx');
assert.equal(reversedResult.pointCount, 3);
assert.ok(reversedResult.movingDurationSec > 0);
assert.equal(
  reversedResult.gradeBreakdown.flatPct +
    reversedResult.gradeBreakdown.rollingPct +
    reversedResult.gradeBreakdown.steepPct +
    reversedResult.gradeBreakdown.extremePct,
  100,
);

assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');

// Edge case: dense sub-25m trackpoints (~11m spacing) over >3km with sustained climb
const densePts = Array.from({ length: 300 }, (_, i) => {
  const lat = (32.2 + i * 0.0001).toFixed(6);
  const ele = 1000 + i * 1.5;
  return `<trkpt lat="${lat}" lon="76.3000"><ele>${ele}</ele></trkpt>`;
}).join('\n');
const denseResult = parseGpxXml(`<gpx><trk><trkseg>${densePts}</trkseg></trk></gpx>`, 'dense.gpx');
assert.ok(denseResult.totalDistanceKm > 3, `Expected >3km, got ${denseResult.totalDistanceKm}`);
assert.ok(denseResult.cruxSegment.gainM >= 200, `Expected dense crux gain >= 200m, got ${denseResult.cruxSegment.gainM}`);

console.log('✓ All GPX parser, edge-case & security assertions passed.');
