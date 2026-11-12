import { FeatureFlags, LightdashMode } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import { MobileSettingsPage } from './MobileSettingsPage';

const health = vi.hoisted<{ mode: LightdashMode | null }>(() => ({
    mode: null,
}));
vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({
        data:
            health.mode === null
                ? undefined
                : { siteUrl: 'https://app.example.com', mode: health.mode },
    }),
}));
vi.mock('../../api');

const FLAG_URL = `/feature-flag/${FeatureFlags.MobileQrSignIn}`;
const installCodeCalls = () =>
    mockedLightdashApi.mock.calls.filter(
        ([call]) =>
            call.method === 'POST' && call.url === '/user/mobile/app-links',
    );

beforeEach(() => {
    health.mode = LightdashMode.CLOUD_BETA;
    mockedLightdashApi.mockReset();
});

describe('MobileSettingsPage flag query', () => {
    it.each([null, LightdashMode.CLOUD_BETA])(
        'creates no install code while setup is unresolved with mode %s',
        async (mode) => {
            health.mode = mode;
            mockedLightdashApi.mockImplementation(
                () => new Promise<never>(() => {}),
            );
            renderWithProviders(<MobileSettingsPage />);

            await waitFor(() =>
                expect(mockedLightdashApi).toHaveBeenCalledWith(
                    expect.objectContaining({ url: FLAG_URL }),
                ),
            );
            expect(installCodeCalls()).toHaveLength(0);
            expect(
                screen.queryByRole('heading', { name: 'Get the app' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('heading', {
                    name: 'Sign in on your phone',
                }),
            ).not.toBeInTheDocument();
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        },
    );

    it('uses the original install setup when the Cloud flag request fails', async () => {
        mockedLightdashApi.mockImplementation(async ({ url, method }) => {
            if (url === FLAG_URL) {
                throw {
                    status: 'error',
                    error: {
                        name: 'NetworkError',
                        statusCode: 503,
                        message: 'The server is unavailable.',
                        data: {},
                    },
                };
            }
            if (method === 'POST' && url === '/user/mobile/app-links') {
                return {
                    linkUuid: 'link-1',
                    scanUrl: 'https://app.example.com/m/app/scan-1',
                    expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
                    expiresInSeconds: 1800,
                };
            }
            return {
                linkUuid: 'link-1',
                expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
                scannedAt: null,
                scanPlatform: null,
            };
        });
        renderWithProviders(<MobileSettingsPage />);

        expect(
            await screen.findByRole('heading', { name: 'Get the app' }),
        ).toBeVisible();
        expect(
            await screen.findByRole('img', {
                name: 'QR code to install the Lightdash app',
            }),
        ).toBeVisible();
        expect(installCodeCalls()).toHaveLength(1);
        expect(
            screen.queryByRole('heading', { name: 'Sign in on your phone' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(
            mockedLightdashApi.mock.calls.filter(
                ([call]) => call.url === FLAG_URL,
            ),
        ).toHaveLength(1);
        expect(
            mockedLightdashApi.mock.calls.some(([call]) =>
                call.url.startsWith('/user/mobile/sign-in-codes'),
            ),
        ).toBe(false);
    });
});
