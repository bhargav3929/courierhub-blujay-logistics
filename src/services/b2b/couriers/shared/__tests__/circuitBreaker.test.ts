import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '../circuitBreaker';
import { CarrierError } from '../carrierErrors';

const transient = () =>
    new CarrierError({
        courier: 'bluedart',
        operation: 'pollStatus',
        category: 'transient',
        httpStatus: 503,
    });

const permanent = () =>
    new CarrierError({
        courier: 'bluedart',
        operation: 'pollStatus',
        category: 'permanent',
        httpStatus: 400,
    });

describe('CircuitBreaker', () => {
    let cb: CircuitBreaker;
    beforeEach(() => {
        cb = new CircuitBreaker({
            failureThreshold: 3,
            rollingWindowMs: 60_000,
            openDurationMs: 1_000,
            halfOpenProbeCount: 2,
        });
    });

    it('starts closed and lets calls through', async () => {
        const r = await cb.exec('k1', async () => 'ok');
        expect(r).toBe('ok');
        expect(cb.stateOf('k1')).toBe('closed');
    });

    it('opens after the failure threshold of transient errors', async () => {
        for (let i = 0; i < 3; i++) {
            await expect(cb.exec('k1', async () => { throw transient(); })).rejects.toBeInstanceOf(CarrierError);
        }
        expect(cb.stateOf('k1')).toBe('open');
    });

    it('fails fast with CircuitOpenError once open', async () => {
        for (let i = 0; i < 3; i++) {
            await cb.exec('k1', async () => { throw transient(); }).catch(() => undefined);
        }
        await expect(cb.exec('k1', async () => 'wont run')).rejects.toBeInstanceOf(CircuitOpenError);
    });

    it('permanent errors do not count toward opening', async () => {
        for (let i = 0; i < 5; i++) {
            await cb.exec('k1', async () => { throw permanent(); }).catch(() => undefined);
        }
        expect(cb.stateOf('k1')).toBe('closed');
    });

    it('does not count generic errors (programmer bugs) toward opening', async () => {
        for (let i = 0; i < 5; i++) {
            await cb.exec('k1', async () => { throw new TypeError('bug'); }).catch(() => undefined);
        }
        expect(cb.stateOf('k1')).toBe('closed');
    });

    it('transitions to half-open after openDurationMs and closes on probe success', async () => {
        for (let i = 0; i < 3; i++) {
            await cb.exec('k1', async () => { throw transient(); }).catch(() => undefined);
        }
        expect(cb.stateOf('k1')).toBe('open');

        await new Promise(r => setTimeout(r, 1_100));

        // First call probes — moves state to half_open inside exec.
        await cb.exec('k1', async () => 'ok');
        expect(cb.stateOf('k1')).toBe('half_open');

        // Second probe success closes.
        await cb.exec('k1', async () => 'ok');
        expect(cb.stateOf('k1')).toBe('closed');
    });

    it('half-open probe failure re-opens the circuit', async () => {
        for (let i = 0; i < 3; i++) {
            await cb.exec('k1', async () => { throw transient(); }).catch(() => undefined);
        }
        await new Promise(r => setTimeout(r, 1_100));
        await expect(cb.exec('k1', async () => { throw transient(); })).rejects.toBeInstanceOf(CarrierError);
        expect(cb.stateOf('k1')).toBe('open');
    });

    it('different keys have independent breakers', async () => {
        for (let i = 0; i < 3; i++) {
            await cb.exec('k1', async () => { throw transient(); }).catch(() => undefined);
        }
        expect(cb.stateOf('k1')).toBe('open');
        expect(cb.stateOf('k2')).toBe('closed');
        await expect(cb.exec('k2', async () => 'ok')).resolves.toBe('ok');
    });
});
