import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const distDir = path.join(process.cwd(), 'dist');
const BASE_PREFIX = '/gpxtrace';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.gpx': 'application/gpx+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function resolveDistFile(urlPath: string): string {
  let clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean === BASE_PREFIX) clean = '/';
  else if (clean.startsWith(`${BASE_PREFIX}/`)) clean = clean.slice(BASE_PREFIX.length);
  else return path.join(distDir, '__missing_root_request__');

  if (clean.endsWith('/')) clean += 'index.html';
  else if (!path.extname(clean)) clean += '/index.html';
  return path.join(distDir, clean);
}

class CdpSession {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  public pageErrors: string[] = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id && this.pending.has(msg.id)) {
        const handler = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) handler.reject(new Error(msg.error.message));
        else handler.resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.pageErrors.push(msg.params?.exceptionDetails?.text || 'Uncaught exception');
      }
    });
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url: string): Promise<void> {
    await this.send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 450));
  }

  async eval<T = any>(expression: string): Promise<T> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `Eval error: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description || ''}`,
      );
    }
    return res.result?.value as T;
  }

  close(): void {
    this.ws.close();
  }
}

async function runBrowserSuite() {
  const server = http.createServer((req, res) => {
    const filePath = resolveDistFile(req.url || '/');
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'content-type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}${BASE_PREFIX}`;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpxtrace-chrome-'));
  const chrome = spawn(
    '/usr/bin/google-chrome-stable',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const wsEndpoint = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for Chrome DevTools')), 8000);
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    };
    chrome.stderr.on('data', onData);
    chrome.stdout.on('data', onData);
    chrome.on('exit', (code) => reject(new Error(`Chrome exited early with code ${code}`)));
  });

  try {
    const devToolsPort = new URL(wsEndpoint).port;
    const targetsRes = await fetch(`http://127.0.0.1:${devToolsPort}/json/list`);
    const targets = (await targetsRes.json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
    const pageTarget = targets.find((t) => t.type === 'page');
    assert.ok(pageTarget, 'No Chrome page target found');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (e) => reject(e));
    });

    const cdp = new CdpSession(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // 1. Verify Home Page (/)
    await cdp.navigate(`${baseUrl}/`);
    const homeState = await cdp.eval<{
      polylines: number;
      distBefore: string;
      liveDistMetric: string;
      distImperial: string;
      unitLabel: string;
      visibleAlpine: number;
    }>(`(() => {
      const cockpit = document.getElementById('hero-cockpit');
      const polylines = cockpit.querySelectorAll('path.leaflet-interactive').length;
      const distBefore = document.querySelector('[data-auto-dist-val]')?.textContent?.trim();

      const wrap = cockpit.querySelector('[data-elevation-wrap]');
      const rect = wrap.getBoundingClientRect();
      wrap.dispatchEvent(new PointerEvent('pointermove', {
        clientX: rect.left + rect.width * 0.5,
        bubbles: true,
      }));
      const liveDistMetric = cockpit.querySelector('[data-live-dist]')?.textContent?.trim();

      document.querySelector('[data-unit-toggle="imperial"]').click();
      const distImperial = document.querySelector('[data-auto-dist-val]')?.textContent?.trim();
      const unitLabel = document.querySelector('[data-unit-label="distance"]')?.textContent?.trim();

      document.querySelector('[data-filter-chip="Alpine"]').click();
      const visibleAlpine = Array.from(document.querySelectorAll('[data-track-card]'))
        .filter((c) => c.dataset.hidden !== 'true').length;
      document.querySelector('[data-filter-chip="all"]').click();

      return { polylines, distBefore, liveDistMetric, distImperial, unitLabel, visibleAlpine };
    })()`);

    assert.ok(homeState.polylines >= 2, `Expected Leaflet track polylines on '/', got ${homeState.polylines}`);
    assert.ok(Number(homeState.distBefore) > 5, `Expected metric distance > 5 km, got ${homeState.distBefore}`);
    assert.ok(homeState.liveDistMetric?.includes('km'), `Expected live hover distance in km, got ${homeState.liveDistMetric}`);
    assert.equal(homeState.unitLabel, 'mi');
    assert.ok(Number(homeState.distImperial) < Number(homeState.distBefore), 'Expected imperial miles < metric km');
    assert.equal(homeState.visibleAlpine, 1);

    // 2. Verify Track Review Detail Page (/tracks/triund-ridge/)
    await cdp.navigate(`${baseUrl}/tracks/triund-ridge/`);
    const detailState = await cdp.eval<{
      topoPressed: string;
      effort: string;
      proseHeading: string;
      downloadHref: string;
    }>(`(() => {
      const topoBtn = document.querySelector('[data-layer-btn="topo"]');
      topoBtn.click();
      const topoPressed = topoBtn.getAttribute('aria-pressed');
      const effort = document.querySelector('[data-auto-effort-score]')?.textContent?.trim();
      const proseHeading = document.querySelector('.prose-content h2')?.textContent?.trim();
      const downloadHref = document.querySelector('a[download]')?.getAttribute('href');
      return { topoPressed, effort, proseHeading, downloadHref };
    })()`);

    assert.equal(detailState.topoPressed, 'true');
    assert.ok(Number(detailState.effort) > 40);
    assert.equal(detailState.proseHeading, 'How the Track Feels Underfoot');
    assert.equal(detailState.downloadHref, `${BASE_PREFIX}/gpx/triund-ridge.gpx`);

    // 3. Verify Upload & Review Studio (/upload/)
    await cdp.navigate(`${baseUrl}/upload/`);
    const uploadState = await cdp.eval<{
      statusPct: string;
      minEleMetric: string;
      distMetric: string;
      minEleImperial: string;
      distImperial: string;
      minEleBackToMetric: string;
      toastText: string;
    }>(`(async () => {
      document.querySelector('[data-unit-toggle="metric"]').click();

      const customGpx = \`<?xml version="1.0"?>
      <gpx version="1.1">
        <trk>
          <name><![CDATA[Badwater <img src=x onerror="window.__xss=1"> Basin]]></name>
          <trkseg>
            <trkpt lon="-116.8258" lat="36.2297"><ele>-85</ele><time>2026-11-01T06:00:00Z</time></trkpt>
            <trkpt lon="-116.8150" lat="36.2350"><ele>-20</ele><time>2026-11-01T06:20:00Z</time></trkpt>
            <trkpt lon="-116.8050" lat="36.2410"><ele>60</ele><time>2026-11-01T06:45:00Z</time></trkpt>
          </trkseg>
        </trk>
      </gpx>\`;

      const dt = new DataTransfer();
      dt.items.add(new File([customGpx], 'badwater-climb.gpx', { type: 'application/gpx+xml' }));
      const dropzone = document.getElementById('gpx-dropzone');
      dropzone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));

      await new Promise((r) => setTimeout(r, 450));

      const statusPct = document.getElementById('upload-status-pct')?.textContent?.trim();
      const minEleMetric = document.querySelector('[data-auto-min-ele]')?.textContent?.trim();
      const distMetric = document.querySelector('[data-auto-dist-val]')?.textContent?.trim();

      document.querySelector('[data-unit-toggle="imperial"]').click();
      const minEleImperial = document.querySelector('[data-auto-min-ele]')?.textContent?.trim();
      const distImperial = document.querySelector('[data-auto-dist-val]')?.textContent?.trim();

      document.querySelector('[data-unit-toggle="metric"]').click();
      const minEleBackToMetric = document.querySelector('[data-auto-min-ele]')?.textContent?.trim();

      document.getElementById('review-editor-form').requestSubmit();
      const toastText = document.getElementById('feedback-toast-text')?.textContent?.trim();

      return {
        statusPct,
        minEleMetric,
        distMetric,
        minEleImperial,
        distImperial,
        minEleBackToMetric,
        toastText,
      };
    })()`);

    assert.equal(uploadState.statusPct, '100%');
    assert.equal(uploadState.minEleMetric, '-85');
    assert.equal(uploadState.minEleImperial, '-279');
    assert.equal(uploadState.minEleBackToMetric, '-85');
    assert.ok(Number(uploadState.distImperial) < Number(uploadState.distMetric));
    assert.ok(uploadState.toastText?.includes('Saved GPX track'));

    // 4. Verify Saved Review Card on Home Page (/) + XSS Safety + All Tracks Count + Unit Toggle
    await cdp.navigate(`${baseUrl}/`);
    const savedHomeState = await cdp.eval<{
      allChipText: string;
      firstCardTitle: string;
      xssTriggered: boolean;
      injectedImgCount: number;
      savedCardUnitLabel: string;
    }>(`(() => {
      const allChipText = document.querySelector('[data-filter-chip="all"]')?.textContent?.trim();
      const firstCardTitle = document.querySelector('.track-card-title a')?.textContent?.trim();
      const xssTriggered = Boolean(window.__xss);
      const injectedImgCount = document.querySelectorAll('.track-card-title img').length;

      document.querySelector('[data-unit-toggle="imperial"]').click();
      const savedCardUnitLabel = document.querySelector('.track-card [data-unit-label="distance"]')?.textContent?.trim();

      return { allChipText, firstCardTitle, xssTriggered, injectedImgCount, savedCardUnitLabel };
    })()`);

    assert.equal(savedHomeState.allChipText, 'All Tracks (4)');
    assert.equal(savedHomeState.xssTriggered, false);
    assert.equal(savedHomeState.injectedImgCount, 0);
    assert.ok(savedHomeState.firstCardTitle?.includes('<img src=x onerror="window.__xss=1">'));
    assert.equal(savedHomeState.savedCardUnitLabel, 'mi');

    // 5. Verify Responsive Layout across ALL routes & viewports (320px, 375px, 768px, 1440px) — Zero Horizontal Overflow
    const viewports = [
      { name: 'Small Mobile', width: 320, height: 568, mobile: true },
      { name: 'Mobile', width: 375, height: 812, mobile: true },
      { name: 'Tablet', width: 768, height: 1024, mobile: true },
      { name: 'Desktop', width: 1440, height: 900, mobile: false },
    ];
    const routes = ['/', '/tracks/triund-ridge/', '/tracks/nandi-hills-climb/', '/upload/'];

    for (const route of routes) {
      await cdp.navigate(`${baseUrl}${route}`);
      for (const vp of viewports) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.mobile,
        });
        await new Promise((r) => setTimeout(r, 100));

        const check = await cdp.eval<{ scrollW: number; innerW: number; mapH: number }>(
          `({
            scrollW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
            mapH: Math.round(document.querySelector('.map-viewport-wrap')?.getBoundingClientRect().height || 0)
          })`,
        );
        console.log(
          `  [${vp.name.padEnd(12)} ${vp.width}x${vp.height}] ${route.padEnd(25)} -> scrollWidth=${check.scrollW}px <= innerWidth=${check.innerW}px (mapHeight=${check.mapH}px)`,
        );
        assert.ok(
          check.scrollW <= check.innerW,
          `${vp.name} (${vp.width}px) on ${route} overflowed horizontally: scrollWidth=${check.scrollW} > innerWidth=${check.innerW}`,
        );
      }
    }

    assert.equal(cdp.pageErrors.length, 0, `Unexpected browser errors: ${cdp.pageErrors.join('; ')}`);

    console.log('✓ All headless Chrome DevTools end-to-end & responsive (Mobile/Tablet/PC) tests passed.');
    cdp.close();
  } finally {
    chrome.kill('SIGKILL');
    server.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

runBrowserSuite();
