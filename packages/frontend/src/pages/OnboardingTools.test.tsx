import { type HealthState } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExternalConnections } from '../features/externalConnections/hooks/useExternalConnections';
import { useExternalSources } from '../features/externalSources/hooks/useExternalSources';
import { renderWithProviders } from '../testing/testUtils';
import OnboardingTools from './OnboardingTools';

const slack = vi.hoisted(() => ({
    data: undefined as { slackTeamName: string } | undefined,
}));
vi.mock('../hooks/slack/useSlack', () => ({
    useGetSlack: () => ({ data: slack.data }),
}));
const project = vi.hoisted(() => ({
    data: undefined as { warehouseConnection: null } | undefined,
    explores: [] as { name: string; type: string }[],
    isLoadingExplores: false,
}));
vi.mock('../hooks/useProject', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useProject: () => ({ data: project.data }),
}));
vi.mock('../hooks/useExplores', () => ({
    useExplores: () => ({
        data: project.isLoadingExplores ? undefined : project.explores,
        isInitialLoading: project.isLoadingExplores,
    }),
}));
vi.mock('../features/externalConnections/hooks/useExternalConnections', () => ({
    useExternalConnections: vi.fn(),
}));
vi.mock(
    '../features/externalSources/hooks/useExternalSources',
    async (importOriginal) => ({
        ...(await importOriginal<object>()),
        useExternalSources: vi.fn(),
    }),
);

const ORG_UUID = '172a2270-000f-42be-9c68-c4752c23ae51';

const LICENSED: Partial<HealthState> = {
    license: { hasLicenseKey: true, valid: true },
};

const renderPage = (health: Partial<HealthState>, search = '') =>
    renderWithProviders(
        <MemoryRouter initialEntries={[`/onboarding/tools/project-1${search}`]}>
            <Routes>
                <Route
                    path="/onboarding/tools/:projectUuid"
                    element={<OnboardingTools />}
                />
                <Route
                    path="/projects/:projectUuid/home"
                    element={<div>project home</div>}
                />
            </Routes>
        </MemoryRouter>,
        {
            health,
            user: {
                abilityRules: [
                    {
                        action: 'manage',
                        subject: 'ExternalConnection',
                        conditions: { organizationUuid: ORG_UUID },
                    },
                    {
                        action: 'manage',
                        subject: 'ExternalSource',
                        conditions: { organizationUuid: ORG_UUID },
                    },
                ],
            },
        },
    );

describe('OnboardingTools', () => {
    beforeEach(() => {
        slack.data = undefined;
        project.data = undefined;
        project.explores = [];
        project.isLoadingExplores = false;
        vi.mocked(useExternalConnections).mockReturnValue({
            data: [],
        } as unknown as ReturnType<typeof useExternalConnections>);
        vi.mocked(useExternalSources).mockReturnValue({
            data: [],
        } as unknown as ReturnType<typeof useExternalSources>);
    });

    it('finishes onboarding without querying external connections on an unlicensed instance', async () => {
        vi.mocked(useExternalConnections).mockClear();
        renderPage(
            { license: { hasLicenseKey: false, valid: false } },
            '?step=done',
        );

        expect(
            await screen.findByRole('link', { name: 'Go to home' }),
        ).toHaveAttribute('href', '/projects/project-1/home');
        expect(vi.mocked(useExternalConnections).mock.calls).toContainEqual([
            undefined,
        ]);
        expect(useExternalConnections).not.toHaveBeenCalledWith('project-1');
    });

    it('offers every enabled group and lets the user skip', async () => {
        renderPage({ ...LICENSED, hasGoogleLiveSources: true });

        expect(
            await screen.findByRole('heading', {
                name: 'Connect other tools',
            }),
        ).toBeInTheDocument();
        expect(screen.getByText('Product analytics')).toBeInTheDocument();
        expect(screen.getByText('Google Analytics 4')).toBeInTheDocument();
        expect(screen.getByText('Google Search Console')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Skip for now' }),
        ).toBeInTheDocument();
    });

    it('hides Google sources when Google sign-in is not configured', async () => {
        renderPage({ ...LICENSED, hasGoogleLiveSources: false });

        expect(
            await screen.findByText('Product analytics'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Google Analytics 4'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Marketing and search'),
        ).not.toBeInTheDocument();
    });

    it('goes straight to the Slack and GitHub step without an Enterprise licence', async () => {
        renderPage({ hasGoogleLiveSources: true, hasSlack: true });

        expect(
            await screen.findByRole('heading', {
                name: 'Bring in your team',
            }),
        ).toBeInTheDocument();
    });

    it('shows Slack as connected once it is installed', async () => {
        slack.data = { slackTeamName: 'Acme' };
        renderPage({ hasSlack: true });

        expect(await screen.findByText('Connected: Acme')).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Connect' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Continue' }),
        ).toBeInTheDocument();
    });

    it('asks for a tool in a project started from tools', async () => {
        project.data = { warehouseConnection: null };
        renderPage(LICENSED);

        expect(
            await screen.findByRole('heading', { name: 'Connect your tools' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    it('holds the button until it knows the project has models', async () => {
        project.data = { warehouseConnection: null };
        project.isLoadingExplores = true;
        renderPage(LICENSED);

        expect(
            await screen.findByRole('button', { name: 'Skip for now' }),
        ).toBeDisabled();
    });

    it('keeps skip for a CLI-deployed project without stored credentials', async () => {
        project.data = { warehouseConnection: null };
        project.explores = [{ name: 'orders', type: 'default' }];
        renderPage(LICENSED);

        expect(
            await screen.findByRole('button', { name: 'Skip for now' }),
        ).toBeEnabled();
    });
});
