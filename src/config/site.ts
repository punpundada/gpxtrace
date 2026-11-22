const BASE_PATH = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');

export const withBase = (path = '/'): string =>
  `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;

export const getSiteBaseUrl = (site?: URL): string =>
  `${new URL(site?.toString() || SITE_CONFIG.siteUrl).origin}${BASE_PATH}`;

export const SITE_CONFIG = {
  name: 'GPXTrace',
  siteUrl: 'https://username.github.io/gpxtrace',
  faviconPath: withBase('/favicon.svg'),
  ogImagePath: withBase('/og-card.svg'),
  themeColor: '#d9480f',
  tagline: 'Trail Maps, Climb Profiles & Honest Route Reviews',
  heroHeadline: 'Explore every switchback, climb, and honest trail review before you head out.',
  heroSubheadline:
    'View detailed trail maps and elevation profiles, see where the steepest climbs are, and read or share real-world route reviews.',
  primaryCtaLabel: 'Upload & Review a Route',
  secondaryCtaLabel: 'Browse Trail Reviews',
  defaultUnit: 'metric' as 'metric' | 'imperial',
  storageKeys: {
    unitSystem: 'gpxtrace_unit_system',
    customReviews: 'gpxtrace_custom_reviews_v1',
  },
  cssVars: {
    accent: '--color-accent',
    surfaceElevated: '--color-surface-elevated',
    markerStart: '--color-marker-start',
    markerEnd: '--color-marker-end',
    gradeFlat: '--color-grade-flat',
    gradeRolling: '--color-grade-rolling',
    gradeSteep: '--color-grade-steep',
    gradeExtreme: '--color-grade-extreme',
  },
} as const;

export const UNIT_FACTORS = {
  kmToMi: 0.621371,
  mToFt: 3.28084,
  earthRadiusKm: 6371,
  secondsPerHour: 3600,
  secondsPerMinute: 60,
  metersPerKm: 1000,
} as const;

export const UNIT_LABELS = {
  metric: {
    distance: 'km',
    elevation: 'm',
    speed: 'km/h',
  },
  imperial: {
    distance: 'mi',
    elevation: 'ft',
    speed: 'mph',
  },
} as const;

export const GPX_THRESHOLDS = {
  elevationNoiseFloorMeters: 1.5,
  movingSpeedFloorKmh: 0.6,
  gradeFlatMaxPct: 3,
  gradeRollingMaxPct: 8,
  gradeSteepMaxPct: 15,
  cruxWindowMinKm: 0.35,
  cruxMinStepKm: 0.025,
  profileSampleCount: 90,
  silhouetteSampleCount: 36,
  effortDistanceWeight: 2.2,
  effortGainWeight: 0.045,
  effortSteepWeight: 0.4,
  effortMaxScore: 99,
  effortMinScore: 12,
  effortModerateMin: 35,
  effortHardMin: 62,
  effortExpertMin: 82,
  pace: {
    casualSpeedKmh: 3.4,
    casualClimbMPerHr: 420,
    steadySpeedKmh: 4.8,
    steadyClimbMPerHr: 600,
    fastSpeedKmh: 6.8,
    fastClimbMPerHr: 850,
  },
} as const;

export const MAP_CONFIG = {
  fitBoundsPadding: [32, 32] as [number, number],
  trackWeight: 4,
  casingWeight: 7,
  markerRadius: 7,
  waypointRadius: 6,
  hoverMarkerRadius: 8,
  layers: {
    osm: {
      id: 'osm',
      label: 'OpenStreetMap',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    },
    topo: {
      id: 'topo',
      label: 'OpenTopoMap',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution:
        'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      maxZoom: 17,
    },
  },
} as const;

export const SVG_CHART_CONFIG = {
  profileWidth: 720,
  profileHeight: 164,
  padTop: 18,
  padBottom: 24,
  padLeft: 8,
  padRight: 8,
  silhouetteWidth: 160,
  silhouetteHeight: 68,
  silhouettePad: 8,
  barWidth: 100,
  barHeight: 10,
} as const;

export const ACTIVITY_TYPES = ['Hiking', 'Trail Run', 'Gravel Cycling', 'Alpine'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const DIFFICULTY_LEVELS = ['Easy', 'Moderate', 'Hard', 'Expert'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const ICON_CONFIG = {
  viewBox: '0 0 24 24',
  strokeWidth: 1.75,
} as const;
