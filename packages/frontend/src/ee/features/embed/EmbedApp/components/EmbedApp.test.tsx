import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedApp from './EmbedApp';

const PROJECT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APP_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PREVIEW_ORIGIN = 'https://preview.example.com';

const mocks = vi.hoisted(() => ({
    health: {} as {
        isInitialLoading: boolean;
        data?: { rudder: object; dataApps: { previewOrigin: string | null } };
    },
}));

vi.mock('../../../../../providers/App/useApp', () => ({
    default: () => ({ health: mocks.health }),
}));

vi.mock('../../../../../features/apps/hooks/useEmbedAppPreviewToken', () => ({
    useEmbedAppPreviewToken: () => ({
        data: { token: 'preview-token', version: 3 },
        isLoading: false,
        error: null,
    }),
}));

vi.mock('../../../../../features/apps/AppIframePreview', () => ({
    default: ({ src }: { src: string }) => (
        <div data-testid="app-iframe" data-src={src} />
    ),
}));

describe('EmbedApp', () => {
    beforeEach(() => {
        mocks.health = { isInitialLoading: true };
    });

    it('does not load the app before health resolves the preview origin', () => {
        renderWithProviders(
            <EmbedApp appUuid={APP_UUID} projectUuid={PROJECT_UUID} />,
        );

        expect(screen.queryByTestId('app-iframe')).not.toBeInTheDocument();
    });

    it('loads the app from the preview origin once health is ready', () => {
        mocks.health = {
            isInitialLoading: false,
            data: { rudder: {}, dataApps: { previewOrigin: PREVIEW_ORIGIN } },
        };

        renderWithProviders(
            <EmbedApp appUuid={APP_UUID} projectUuid={PROJECT_UUID} />,
        );

        expect(screen.getByTestId('app-iframe').dataset.src).toMatch(
            new RegExp(`^${PREVIEW_ORIGIN}/api/apps/${APP_UUID}/versions/3/`),
        );
    });
});
