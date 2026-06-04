import { describe, expect, it } from 'vitest';
import { isTelemetryAllowed } from './telemetry.js';

describe('isTelemetryAllowed', () => {
  const cfg = (enabled: boolean, allowTelemetry: boolean) => ({
    telemetry: { enabled },
    privacy: { allowTelemetry },
  });

  it('requires both the operational toggle and the privacy switch', () => {
    expect(isTelemetryAllowed(cfg(true, true))).toBe(true);
    expect(isTelemetryAllowed(cfg(true, false))).toBe(false);
    expect(isTelemetryAllowed(cfg(false, true))).toBe(false);
    expect(isTelemetryAllowed(cfg(false, false))).toBe(false);
  });

  it('a privacy-conscious user who clears allowTelemetry is never tracked', () => {
    // Even if telemetry.enabled is somehow true, allowTelemetry=false wins.
    expect(isTelemetryAllowed(cfg(true, false))).toBe(false);
  });
});
