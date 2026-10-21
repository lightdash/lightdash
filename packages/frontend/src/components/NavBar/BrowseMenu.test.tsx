import {
    FeatureFlags,
    type HealthState,
    type LightdashUserWithAbilityRules,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHasMetricsInCatalog } from '../../features/metricsCatalog/hooks/useMetricsCatalog';
import { useFavorites } from '../../hooks/favorites/useFavorites';
import { useProject } from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import { renderWithProviders } from '../../testing/testUtils';
import BrowseMenu from './BrowseMenu';

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

vi.mock('../../hooks/useSpaces', () => ({
    useSpaceSummaries: vi.fn(),
}));

vi.mock('../../features/metricsCatalog/hooks/useMetricsCatalog', () => ({
    useHasMetricsInCatalog: vi.fn(),
}));

vi.mock('../../hooks/favorites/useFavorites', () => ({
    useFavorites: vi.fn(),
}));

vi.mock('../../hooks/useProject', () => ({
    useProject: vi.fn(),
}));

vi.mock('../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => ({
        projectUuid: 'project-1',
        projectUrlIdentifier: 'jaffle-shop',
    }),
}));

const projectUuid = 'project-1';

const setFlags = (enabledFlags: string[]) => {
    vi.mocked(useServerFeatureFlag).mockImplementation(
        (flag) =>
            ({
                data: { id: flag, enabled: enabledFlags.includes(flag) },
                isLoading: false,
            }) as ReturnType<typeof useServerFeatureFlag>,
    );
};

const runtimeHealth = (runtimeAvailable: boolean): Partial<HealthState> => ({
    license: { hasLicenseKey: true, valid: true },
    dataApps: {
        previewOrigin: null,
        sampleDataEnabled: true,
        capturesEnabled: true,
        runtimeAvailable,
    },
});

const dataAppViewerRules: LightdashUserWithAbilityRules['abilityRules'] = [
    { action: 'view', subject: 'Project' },
    { action: 'view', subject: 'SavedChart' },
    { action: 'view', subject: 'DataApp' },
    { action: 'manage', subject: 'Explore' },
];

const renderMenu = (
    abilityRules?: LightdashUserWithAbilityRules['abilityRules'],
    health: Partial<HealthState> = runtimeHealth(false),
) => {
    const result = renderWithProviders(
        <MemoryRouter>
            <BrowseMenu projectUuid={projectUuid} />
        </MemoryRouter>,
        abilityRules ? { user: { abilityRules }, health } : { health },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    return result;
};

describe('BrowseMenu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setFlags([FeatureFlags.EnableDataApps, FeatureFlags.Documents]);
        vi.mocked(useSpaceSummaries).mockReturnValue({
            data: [],
            isInitialLoading: false,
        } as unknown as ReturnType<typeof useSpaceSummaries>);
        vi.mocked(useHasMetricsInCatalog).mockReturnValue({
            data: true,
        } as ReturnType<typeof useHasMetricsInCatalog>);
        vi.mocked(useFavorites).mockReturnValue({
            data: [],
        } as unknown as ReturnType<typeof useFavorites>);
        vi.mocked(useProject).mockReturnValue({
            data: undefined,
        } as unknown as ReturnType<typeof useProject>);
    });

    it('uses the project slug for document discovery', async () => {
        renderMenu();
        expect(
            (await screen.findByText('All documents')).closest('a'),
        ).toHaveAttribute('href', '/projects/jaffle-shop/documents');
    });

    it('links to Chart Studio when data apps are enabled and the user can manage explores', async () => {
        renderMenu(dataAppViewerRules);

        expect(await screen.findByText('All data apps')).toBeInTheDocument();
        const item = await screen.findByText('Chart Studio');
        expect(item.closest('a')).toHaveAttribute(
            'href',
            '/projects/jaffle-shop/chart-studio',
        );
    });

    it('shows Chart Studio but not data apps when only the runtime is available', async () => {
        setFlags([]);
        renderMenu(dataAppViewerRules, runtimeHealth(true));

        const item = await screen.findByText('Chart Studio');
        expect(item.closest('a')).toHaveAttribute(
            'href',
            '/projects/jaffle-shop/chart-studio',
        );
        expect(screen.queryByText('All data apps')).not.toBeInTheDocument();
    });

    it('hides chart types without a runtime, the library or data apps', async () => {
        setFlags([]);
        renderMenu();

        await screen.findByText('All saved charts');
        expect(screen.queryByText('Chart Studio')).not.toBeInTheDocument();
    });

    it('hides chart types when the user cannot manage explores', async () => {
        renderMenu([
            { action: 'view', subject: 'Project' },
            { action: 'view', subject: 'SavedChart' },
        ]);

        await screen.findByText('All saved charts');
        await waitFor(() => {
            expect(screen.queryByText('Chart Studio')).not.toBeInTheDocument();
        });
    });

    it('hides chart types when the user can only manage explores in another organization', async () => {
        renderMenu([
            {
                action: 'manage',
                subject: 'Explore',
                conditions: { organizationUuid: 'another-org' },
            },
        ]);

        await screen.findByText('All saved charts');
        await waitFor(() => {
            expect(screen.queryByText('Chart Studio')).not.toBeInTheDocument();
        });
    });
});
