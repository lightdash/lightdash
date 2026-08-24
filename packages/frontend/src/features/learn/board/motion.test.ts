import { describe, expect, it } from 'vitest';
import { resolveMotion, staggerMs, type MotionInput } from './motion';

const base: MotionInput = {
    unlocked: true,
    wasUnlocked: true,
    seat: { x: 100, y: 100 },
    prevSeat: { x: 80, y: 80 },
    origin: { x: 10, y: 10 },
    burst: false,
    reducedMotion: false,
};

describe('resolveMotion', () => {
    it('a settled unlocked node sits at its seat, fully visible, animated', () => {
        expect(resolveMotion(base)).toEqual({
            x: 100,
            y: 100,
            opacity: 1,
            scale: 1,
            animate: true,
        });
    });

    it('a settled locked node is parked invisible and small', () => {
        expect(
            resolveMotion({ ...base, unlocked: false, wasUnlocked: false }),
        ).toEqual({
            x: 100,
            y: 100,
            opacity: 0,
            scale: 0.3,
            animate: true,
        });
    });

    it('a newly unlocked node starts on the origin for the burst frame, then flies to its seat', () => {
        const born = { ...base, wasUnlocked: false };
        expect(resolveMotion({ ...born, burst: true })).toEqual({
            x: 10,
            y: 10,
            opacity: 0.5,
            scale: 0.25,
            animate: false,
        });
        expect(resolveMotion(born)).toEqual({
            x: 100,
            y: 100,
            opacity: 1,
            scale: 1,
            animate: true,
        });
    });

    it('a newly locked node holds its previous seat for the burst frame, then collapses into the origin', () => {
        const dying = { ...base, unlocked: false };
        expect(resolveMotion({ ...dying, burst: true })).toEqual({
            x: 80,
            y: 80,
            opacity: 1,
            scale: 1,
            animate: false,
        });
        expect(resolveMotion(dying)).toEqual({
            x: 10,
            y: 10,
            opacity: 0,
            scale: 0.2,
            animate: true,
        });
    });

    it('without an origin or under reduced motion nodes snap to their final state', () => {
        expect(
            resolveMotion({
                ...base,
                wasUnlocked: false,
                burst: true,
                origin: null,
            }),
        ).toEqual({
            x: 100,
            y: 100,
            opacity: 1,
            scale: 1,
            animate: true,
        });
        expect(
            resolveMotion({ ...base, unlocked: false, reducedMotion: true }),
        ).toEqual({
            x: 100,
            y: 100,
            opacity: 0,
            scale: 0.3,
            animate: false,
        });
    });
});

describe('staggerMs', () => {
    it('cycles every ten nodes in 28ms steps', () => {
        expect(staggerMs(0)).toBe(0);
        expect(staggerMs(3)).toBe(84);
        expect(staggerMs(10)).toBe(0);
    });
});
