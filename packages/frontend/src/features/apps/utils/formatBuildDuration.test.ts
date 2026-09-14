import { describe, expect, it } from 'vitest';
import { formatBuildDuration } from './formatBuildDuration';

describe('formatBuildDuration', () => {
    it('renders sub-minute builds in seconds', () => {
        expect(formatBuildDuration(52_000)).toBe('52s');
    });

    it('rounds to the nearest second', () => {
        expect(formatBuildDuration(52_400)).toBe('52s');
        expect(formatBuildDuration(52_600)).toBe('53s');
    });

    it('never claims a build took no time', () => {
        expect(formatBuildDuration(0)).toBe('1s');
        expect(formatBuildDuration(120)).toBe('1s');
    });

    it('switches to minutes at a minute', () => {
        expect(formatBuildDuration(60_000)).toBe('1m');
        expect(formatBuildDuration(72_000)).toBe('1m 12s');
        expect(formatBuildDuration(605_000)).toBe('10m 5s');
    });

    it('omits a zero seconds remainder', () => {
        expect(formatBuildDuration(180_000)).toBe('3m');
    });
});
