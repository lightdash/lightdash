import { describe, expect, it } from 'vitest';
import { type DataAppPreviewData } from '../../../store/aiArtifactSlice';
import {
    getEffectiveDataAppVersion,
    isDataAppCardActive,
} from './dataAppPreviewVersion';

const preview = (
    overrides: Partial<DataAppPreviewData>,
): DataAppPreviewData => ({
    appUuid: 'app-1',
    messageUuid: 'message-1',
    threadUuid: 'thread-1',
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    version: null,
    latestReadyVersionAtOpen: null,
    ...overrides,
});

describe('getEffectiveDataAppVersion', () => {
    it('resolves a null version to the latest ready version', () => {
        expect(
            getEffectiveDataAppVersion({
                version: null,
                latestReadyVersionAtOpen: null,
                latestReadyVersion: 3,
            }),
        ).toBe(3);
    });

    it('is null while the app has no ready version', () => {
        expect(
            getEffectiveDataAppVersion({
                version: null,
                latestReadyVersionAtOpen: null,
                latestReadyVersion: null,
            }),
        ).toBeNull();
    });

    it('keeps an explicit older version while latest is unchanged', () => {
        expect(
            getEffectiveDataAppVersion({
                version: 1,
                latestReadyVersionAtOpen: 3,
                latestReadyVersion: 3,
            }),
        ).toBe(1);
    });

    it('jumps to latest once a newer ready version lands', () => {
        expect(
            getEffectiveDataAppVersion({
                version: 1,
                latestReadyVersionAtOpen: 3,
                latestReadyVersion: 4,
            }),
        ).toBe(4);
    });

    it('keeps an explicit version while the app is still loading', () => {
        expect(
            getEffectiveDataAppVersion({
                version: 2,
                latestReadyVersionAtOpen: 3,
                latestReadyVersion: null,
            }),
        ).toBe(2);
    });

    it('keeps an explicit version when nothing was recorded at open', () => {
        expect(
            getEffectiveDataAppVersion({
                version: 1,
                latestReadyVersionAtOpen: null,
                latestReadyVersion: 4,
            }),
        ).toBe(1);
    });
});

describe('isDataAppCardActive', () => {
    it('is inactive with no preview open', () => {
        expect(
            isDataAppCardActive({
                preview: null,
                appUuid: 'app-1',
                version: 1,
                latestReadyVersion: 1,
            }),
        ).toBe(false);
    });

    it('is inactive for a card without an app or version', () => {
        const open = preview({ version: 1 });
        expect(
            isDataAppCardActive({
                preview: open,
                appUuid: null,
                version: 1,
                latestReadyVersion: 1,
            }),
        ).toBe(false);
        expect(
            isDataAppCardActive({
                preview: open,
                appUuid: 'app-1',
                version: null,
                latestReadyVersion: 1,
            }),
        ).toBe(false);
    });

    it('is inactive for another app', () => {
        expect(
            isDataAppCardActive({
                preview: preview({ appUuid: 'app-2', version: 1 }),
                appUuid: 'app-1',
                version: 1,
                latestReadyVersion: 1,
            }),
        ).toBe(false);
    });

    it('activates only the card for the version on show', () => {
        const open = preview({ version: 1, latestReadyVersionAtOpen: 3 });
        const active = (version: number) =>
            isDataAppCardActive({
                preview: open,
                appUuid: 'app-1',
                version,
                latestReadyVersion: 3,
            });
        expect(active(1)).toBe(true);
        expect(active(3)).toBe(false);
    });

    it('activates the latest card for a content link preview', () => {
        const open = preview({ version: null });
        const active = (version: number) =>
            isDataAppCardActive({
                preview: open,
                appUuid: 'app-1',
                version,
                latestReadyVersion: 3,
            });
        expect(active(3)).toBe(true);
        expect(active(1)).toBe(false);
    });

    it('moves the highlight to the card that just landed', () => {
        const open = preview({ version: 1, latestReadyVersionAtOpen: 3 });
        const active = (version: number) =>
            isDataAppCardActive({
                preview: open,
                appUuid: 'app-1',
                version,
                latestReadyVersion: 4,
            });
        expect(active(4)).toBe(true);
        expect(active(1)).toBe(false);
    });
});
