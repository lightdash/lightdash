import { LightdashMode } from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import { MobileSignInMenu } from './MobileSignInMenu';
import {
    isPreviewBuild,
    parsePreviewSignInPhase,
    PREVIEW_SIGN_IN_PHASES,
    previewSignInLabel,
} from './previewSignInState';

vi.mock('../../api');
const health = vi.hoisted(() => ({ mode: 'pr' }));
vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({
        data: { siteUrl: 'https://app.example.com', mode: health.mode },
    }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { id: 'mobile-qr-sign-in', enabled: true },
    }),
}));

const api = mockedLightdashApi;

const renderMenu = (search: string) =>
    renderWithProviders(
        <MemoryRouter initialEntries={[`/projects/p1/saved/c1${search}`]}>
            <MobileSignInMenu />
        </MemoryRouter>,
    );

const openMenu = () =>
    userEvent.click(
        screen.getByRole('button', { name: 'Sign in on your phone' }),
    );

const EXPECTED_TEXT = {
    claimed: 'A phone wants to sign in as you',
    approved: 'Type this number on your phone',
    redeemed: 'Signed in on a phone',
    expired: 'Code expired',
    declined: 'Sign-in declined',
    refused: 'Too many codes. Try again later.',
    failed: "Couldn't create the code",
} as const;

beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async ({ method }: { method: string }) =>
        method === 'POST'
            ? {
                  codeUuid: 'code-1',
                  signInUrl: 'https://app.example.com/m/sign-in#c=code-1',
                  approvalNonce: 'nonce-1',
                  expiresAt: new Date(Date.now() + 120_000).toISOString(),
                  expiresInSeconds: 120,
              }
            : undefined,
    );
    health.mode = LightdashMode.PR;
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('preview sign-in state', () => {
    it('reads only the forceable phase names', () => {
        PREVIEW_SIGN_IN_PHASES.forEach((phase) => {
            expect(parsePreviewSignInPhase(`?mobileSignInState=${phase}`)).toBe(
                phase,
            );
        });
        ['', '?mobileSignInState=showing', '?mobileSignInState=x'].forEach(
            (search) => {
                expect(parsePreviewSignInPhase(search)).toBeNull();
            },
        );
    });

    it('is on only in preview mode or a dev build', () => {
        expect(isPreviewBuild(LightdashMode.PR, false)).toBe(true);
        expect(isPreviewBuild(LightdashMode.DEV, true)).toBe(true);
        expect(isPreviewBuild(LightdashMode.DEFAULT, false)).toBe(false);
        expect(isPreviewBuild(LightdashMode.CLOUD_BETA, false)).toBe(false);
        expect(isPreviewBuild(undefined, false)).toBe(false);
    });

    it.each(PREVIEW_SIGN_IN_PHASES)(
        'shows %s without calling the sign-in API',
        async (phase) => {
            renderMenu(`?mobileSignInState=${phase}`);
            await openMenu();
            expect(
                await screen.findByText(EXPECTED_TEXT[phase]),
            ).toBeInTheDocument();
            expect(
                screen.getByText(previewSignInLabel(phase)),
            ).toBeInTheDocument();
            expect(api).not.toHaveBeenCalled();
        },
    );

    it('moves the preview from claimed to approved on Confirm with no API call', async () => {
        renderMenu('?mobileSignInState=claimed');
        await openMenu();
        const confirm = await screen.findByRole('dialog', {
            name: EXPECTED_TEXT.claimed,
        });
        await userEvent.click(
            within(confirm).getByRole('button', { name: 'Confirm' }),
        );
        expect(
            await screen.findByText(EXPECTED_TEXT.approved),
        ).toBeInTheDocument();
        expect(
            screen.getByText(previewSignInLabel('approved')),
        ).toBeInTheDocument();
        await userEvent.keyboard('{Escape}');
        expect(api).not.toHaveBeenCalled();
    });

    it('ignores an invalid value and signs in as usual', async () => {
        renderMenu('?mobileSignInState=showing');
        await openMenu();
        await vi.waitFor(() => expect(api).toHaveBeenCalled());
        expect(screen.queryByText(/Preview state/)).not.toBeInTheDocument();
    });

    it('is off outside preview builds', async () => {
        vi.stubEnv('DEV', false);
        health.mode = LightdashMode.CLOUD_BETA;
        renderMenu('?mobileSignInState=redeemed');
        await openMenu();
        await vi.waitFor(() => expect(api).toHaveBeenCalled());
        expect(screen.queryByText(/Preview state/)).not.toBeInTheDocument();
        expect(
            screen.queryByText(EXPECTED_TEXT.redeemed),
        ).not.toBeInTheDocument();
    });
});
