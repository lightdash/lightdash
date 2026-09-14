import {
    FeatureFlags,
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

const projectUuid = 'project-1';

const setDataAppsFlag = (enabled: boolean) => {
    vi.mocked(useServerFeatureFlag).mockReturnValue({
        data: { id: FeatureFlags.EnableDataApps, enabled },
        isLoading: false,
    } as ReturnType<typeof useServerFeatureFlag>);
};

const renderMenu = (
    abilityRules?: LightdashUserWithAbilityRules['abilityRules'],
) => {
    const result = renderWithProviders(
        <MemoryRouter>
            <BrowseMenu projectUuid={projectUuid} />
        </MemoryRouter>,
        abilityRules ? { user: { abilityRules } } : undefined,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    return result;
};

describe('BrowseMenu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setDataAppsFlag(true);
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

    it('links to the gallery when data apps are enabled and the user can manage explores', async () => {
        renderMenu();

        const item = await screen.findByText('Chart types');
        expect(item.closest('a')).toHaveAttribute(
            'href',
            `/projects/${projectUuid}/gallery`,
        );
    });

    it('hides chart types when the data apps flag is off', async () => {
        setDataAppsFlag(false);
        renderMenu();

        await screen.findByText('All saved charts');
        expect(screen.queryByText('Chart types')).not.toBeInTheDocument();
    });

    it('hides chart types when the user cannot manage explores', async () => {
        renderMenu([
            { action: 'view', subject: 'Project' },
            { action: 'view', subject: 'SavedChart' },
        ]);

        await screen.findByText('All saved charts');
        await waitFor(() => {
            expect(screen.queryByText('Chart types')).not.toBeInTheDocument();
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
            expect(screen.queryByText('Chart types')).not.toBeInTheDocument();
        });
    });
});
