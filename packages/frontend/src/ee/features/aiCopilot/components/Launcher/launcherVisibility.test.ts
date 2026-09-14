import { describe, expect, it } from 'vitest';
import { shouldRenderAiAgentsLauncherContent } from './launcherVisibility';

describe('shouldRenderAiAgentsLauncherContent', () => {
    const base = {
        dockItemCount: 0,
        hasSelectedAgent: true,
        isAllowed: true,
        isContentPage: true,
        isModalHosted: true,
        isPanelOpen: false,
    };

    it('hides an empty minimized launcher in a modal over a content page', () => {
        expect(shouldRenderAiAgentsLauncherContent(base)).toBe(false);
    });

    it('keeps an open modal-hosted conversation visible', () => {
        expect(
            shouldRenderAiAgentsLauncherContent({
                ...base,
                isPanelOpen: true,
            }),
        ).toBe(true);
    });

    it('keeps existing docked conversations visible in the modal', () => {
        expect(
            shouldRenderAiAgentsLauncherContent({
                ...base,
                dockItemCount: 1,
            }),
        ).toBe(true);
    });

    it('preserves the empty launcher bubble on a global content page', () => {
        expect(
            shouldRenderAiAgentsLauncherContent({
                ...base,
                isModalHosted: false,
            }),
        ).toBe(true);
    });
});
