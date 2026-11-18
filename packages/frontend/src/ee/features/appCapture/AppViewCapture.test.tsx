import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type CaptureResult, type CaptureSurface } from '../capture';
import AppViewCapture from './AppViewCapture';

const mocks = vi.hoisted(() => ({
    surface: null as CaptureSurface | null,
    sendToAgent: vi.fn(async () => undefined),
}));

vi.mock('../capture', () => ({
    CaptureHost: ({ surface }: { surface: CaptureSurface }) => {
        mocks.surface = surface;
        return null;
    },
}));

vi.mock('../dashboardCapture/useSendCaptureToAgent', () => ({
    useSendCaptureToAgent: () => mocks.sendToAgent,
}));

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastInfo: vi.fn(), showToastError: vi.fn() }),
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { ai: { voiceTranscriptionAvailable: true } } },
    }),
}));

vi.mock('../../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => vi.fn(),
}));

describe('AppViewCapture', () => {
    beforeEach(() => {
        mocks.surface = null;
        mocks.sendToAgent.mockClear();
    });

    const renderCapture = () =>
        render(
            <AppViewCapture
                projectUuid="project-1"
                appName="Sales pulse"
                agentUuid="agent-1"
                getRegion={() => new DOMRect(0, 0, 100, 100)}
                onRecordingChange={() => {}}
            />,
        );

    it('takes no screenshots, so the browser never asks to share the tab', () => {
        renderCapture();
        expect(mocks.surface?.captureImages).toBe(false);
        expect(mocks.surface?.transcribe).not.toBeNull();
    });

    it('sends the marks and words to the agent as text', async () => {
        renderCapture();
        const result: CaptureResult = {
            images: [],
            summary: [
                '[Voice Design capture, 0:05.]',
                '- ① (0:02) circled, top left: "why is this so low"',
            ].join('\n'),
            marks: [],
            transcript: [],
            durationMs: 5000,
        };

        mocks.surface?.onCapture(result);

        await vi.waitFor(() =>
            expect(mocks.sendToAgent).toHaveBeenCalledWith({
                agentUuid: 'agent-1',
                prompt: [
                    'These questions are about the data app "Sales pulse".',
                    '',
                    '- ① (0:02) circled, top left: "why is this so low"',
                ].join('\n'),
                context: [],
            }),
        );
    });
});
