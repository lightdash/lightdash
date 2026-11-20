import { describe, expect, it } from 'vitest';
import { buildAppCapturePrompt, canCaptureOnAppView } from './appViewCapture';

describe('canCaptureOnAppView', () => {
    const allowed = {
        flagEnabled: true,
        canUseAgents: true,
        hasAgent: true,
        hasPreview: true,
    };

    it('shows the button to anyone who can use the agents, whatever their edit rights', () => {
        // Edit rights are not an input: a viewer and an editor get the same answer.
        expect(canCaptureOnAppView(allowed)).toBe(true);
    });

    it('hides the button when the flag is off', () => {
        expect(canCaptureOnAppView({ ...allowed, flagEnabled: false })).toBe(
            false,
        );
    });

    it('hides the button from users who cannot use the agents', () => {
        expect(canCaptureOnAppView({ ...allowed, canUseAgents: false })).toBe(
            false,
        );
    });

    it('hides the button when the project has no agent to ask', () => {
        expect(canCaptureOnAppView({ ...allowed, hasAgent: false })).toBe(
            false,
        );
    });

    it('hides the button when there is no app on screen to draw on', () => {
        expect(canCaptureOnAppView({ ...allowed, hasPreview: false })).toBe(
            false,
        );
    });
});

describe('buildAppCapturePrompt', () => {
    const summary = [
        '[Voice Design capture, 0:12. The 2 attached images show the page with numbered red marks, in order.]',
        'Image 1:',
        '- ① (0:02) circled, top left: "why is this so low"',
        '- (0:05) "and overall"',
        'Image 2 (after scrolling or clicking):',
        '- ② (0:08) underlined, middle: "what drives this"',
        'Speech is machine-transcribed and may mishear names. Trust the image where they disagree.',
    ].join('\n');

    it('starts with a line naming the app', () => {
        const prompt = buildAppCapturePrompt({
            appName: 'Sales pulse',
            summary,
            hasImages: true,
        });
        expect(prompt.split('\n')[0]).toBe(
            'These questions are about the data app "Sales pulse".',
        );
    });

    it('keeps the whole summary when the screenshots are attached', () => {
        const prompt = buildAppCapturePrompt({
            appName: 'Sales pulse',
            summary,
            hasImages: true,
        });
        expect(prompt).toBe(
            `These questions are about the data app "Sales pulse".\n\n${summary}`,
        );
    });

    it('keeps only the marks and words when there are no screenshots', () => {
        const prompt = buildAppCapturePrompt({
            appName: 'Sales pulse',
            summary,
            hasImages: false,
        });
        expect(prompt).toBe(
            [
                'These questions are about the data app "Sales pulse".',
                '',
                '- ① (0:02) circled, top left: "why is this so low"',
                '- (0:05) "and overall"',
                '- ② (0:08) underlined, middle: "what drives this"',
            ].join('\n'),
        );
        expect(prompt).not.toMatch(/image|screenshot/i);
    });
});
