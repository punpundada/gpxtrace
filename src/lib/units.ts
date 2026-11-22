import { SITE_CONFIG, UNIT_FACTORS, UNIT_LABELS } from '../config/site';

export type UnitSystem = 'metric' | 'imperial';

export function formatDistanceByUnit(km: number, unit: UnitSystem): string {
  const val = unit === 'imperial' ? km * UNIT_FACTORS.kmToMi : km;
  return `${val.toFixed(2)} ${UNIT_LABELS[unit].distance}`;
}

export function formatElevationByUnit(m: number, unit: UnitSystem): string {
  const val = unit === 'imperial' ? Math.round(m * UNIT_FACTORS.mToFt) : Math.round(m);
  return `${val} ${UNIT_LABELS[unit].elevation}`;
}

export function getActiveUnit(): UnitSystem {
  const saved = localStorage.getItem(SITE_CONFIG.storageKeys.unitSystem);
  return saved === 'imperial' ? 'imperial' : SITE_CONFIG.defaultUnit;
}

export function applyUnitSystem(unit: UnitSystem = getActiveUnit()): void {
  localStorage.setItem(SITE_CONFIG.storageKeys.unitSystem, unit);

  document.querySelectorAll<HTMLButtonElement>('[data-unit-toggle]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.unitToggle === unit));
  });

  document.querySelectorAll<HTMLElement>('[data-unit-km]').forEach((el) => {
    const km = Number.parseFloat(el.dataset.unitKm || '0');
    const decimals = Number.parseInt(el.dataset.unitDecimals || '2', 10);
    const val = unit === 'imperial' ? km * UNIT_FACTORS.kmToMi : km;
    el.textContent = val.toFixed(decimals);
  });

  document.querySelectorAll<HTMLElement>('[data-unit-m]').forEach((el) => {
    const m = Number.parseFloat(el.dataset.unitM || '0');
    const prefix = el.dataset.unitPrefix || '';
    const val = Math.round(m * (unit === 'imperial' ? UNIT_FACTORS.mToFt : 1));
    el.textContent = `${prefix}${val}`;
  });

  document.querySelectorAll<HTMLElement>('[data-unit-kmh]').forEach((el) => {
    const kmh = Number.parseFloat(el.dataset.unitKmh || '0');
    const val = unit === 'imperial' ? kmh * UNIT_FACTORS.kmToMi : kmh;
    el.textContent = val.toFixed(1);
  });

  document.querySelectorAll<HTMLElement>('[data-unit-label]').forEach((el) => {
    const key = el.dataset.unitLabel as keyof (typeof UNIT_LABELS)['metric'];
    if (key && UNIT_LABELS[unit][key]) {
      el.textContent = UNIT_LABELS[unit][key];
    }
  });

  window.dispatchEvent(new CustomEvent('gpxtrace:unit-change', { detail: { unit } }));
}
