import { describe, expect, it } from 'vitest';
import { shouldRenderAiAgentsLauncherContent } from './launcherVisibility';

describe('shouldRenderAiAgentsLauncherContent', () => {
    const base = {
        dockItemCount: 0,
        hasAnalysisTab: false,
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

    it('shows the launcher for analysis alone, with no agent to chat with', () => {
        expect(
            shouldRenderAiAgentsLauncherContent({
                ...base,
                hasSelectedAgent: false,
                hasAnalysisTab: true,
                isModalHosted: false,
            }),
        ).toBe(true);
    });

    it('hides the launcher without an agent or an analysis tab', () => {
        expect(
            shouldRenderAiAgentsLauncherContent({
                ...base,
                hasSelectedAgent: false,
                isModalHosted: false,
            }),
        ).toBe(false);
    });
});
