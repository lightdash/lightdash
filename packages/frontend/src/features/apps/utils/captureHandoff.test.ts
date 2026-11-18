import { beforeEach, describe, expect, it } from 'vitest';
import {
    canCaptureOnAppView,
    holdCaptureForBuilder,
    takeCaptureForBuilder,
} from './captureHandoff';

const capture = () => ({
    images: [new File([], 'capture-1.png')],
    summary: '1. Make this weekly',
});

describe('canCaptureOnAppView', () => {
    const allowed = {
        flagEnabled: true,
        canEditApp: true,
        capturesEnabled: true,
        hasPreview: true,
    };

    it('shows the button to an editor when the flag is on', () => {
        expect(canCaptureOnAppView(allowed)).toBe(true);
    });

    it('hides the button when the flag is off', () => {
        expect(canCaptureOnAppView({ ...allowed, flagEnabled: false })).toBe(
            false,
        );
    });

    it('hides the button from users who cannot edit the app', () => {
        expect(canCaptureOnAppView({ ...allowed, canEditApp: false })).toBe(
            false,
        );
    });

    it('hides the button when the organization turned captures off', () => {
        expect(
            canCaptureOnAppView({ ...allowed, capturesEnabled: false }),
        ).toBe(false);
    });

    it('hides the button when there is no app on screen to draw on', () => {
        expect(canCaptureOnAppView({ ...allowed, hasPreview: false })).toBe(
            false,
        );
    });
});

describe('capture hand-off to the builder', () => {
    beforeEach(() => {
        takeCaptureForBuilder('any');
    });

    it('gives the capture to the builder of the same app', () => {
        const held = capture();
        holdCaptureForBuilder('app-1', held);
        expect(takeCaptureForBuilder('app-1')).toBe(held);
    });

    it('gives the capture only once', () => {
        holdCaptureForBuilder('app-1', capture());
        takeCaptureForBuilder('app-1');
        expect(takeCaptureForBuilder('app-1')).toBeNull();
    });

    it('returns nothing when no capture is held', () => {
        expect(takeCaptureForBuilder('app-1')).toBeNull();
    });

    it('drops a capture meant for another app', () => {
        holdCaptureForBuilder('app-1', capture());
        expect(takeCaptureForBuilder('app-2')).toBeNull();
        expect(takeCaptureForBuilder('app-1')).toBeNull();
    });

    it('keeps only the latest capture', () => {
        const latest = capture();
        holdCaptureForBuilder('app-1', capture());
        holdCaptureForBuilder('app-1', latest);
        expect(takeCaptureForBuilder('app-1')).toBe(latest);
    });
});
