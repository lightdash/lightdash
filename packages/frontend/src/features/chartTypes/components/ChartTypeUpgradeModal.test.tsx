import {
    type DataAppViz,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useDataAppVizUpgradeImpact } from '../hooks/useDataAppVizUpgradeImpact';
import { useInstallRegistryChartType } from '../hooks/useInstallRegistryChartType';
import ChartTypeUpgradeModal from './ChartTypeUpgradeModal';

vi.mock('../hooks/useDataAppVizUpgradeImpact', () => ({
    useDataAppVizUpgradeImpact: vi.fn(),
}));
vi.mock('../hooks/useInstallRegistryChartType', () => ({
    useInstallRegistryChartType: vi.fn(),
}));

const upgrade = vi.fn();
const refetchImpact = vi.fn();
const onClose = vi.fn();

const viz: DataAppViz = {
    dataAppVizUuid: 'viz-1',
    slug: 'sankey',
    name: 'Sankey diagram',
    description: '',
    projectUuid: 'project-1',
    spaceUuid: null,
    schema: null,
    icon: null,
    createdAt: new Date(),
    createdByUserUuid: 'user-1',
    registrySlug: 'sankey',
};

const registryUpdate: RegistryChartTypeListItem = {
    slug: 'sankey',
    name: 'Sankey diagram',
    description: '',
    version: '1.3.0',
    publishedAt: '2026-08-01T00:00:00Z',
    tags: [],
    changelog: 'Adds link labels',
    releaseStage: 'stable',
    minLightdashVersion: null,
    icon: null,
    vizSchema: {
        fields: [],
        configOptions: [],
        colorPalette: null,
    },
    thumbnail: null,
    thumbnailDark: null,
    preview: null,
    screenshots: [],
    artifacts: {
        source: { path: 'sankey/1.3.0/source.tar', sha256: 'a'.repeat(64) },
        dist: { path: 'sankey/1.3.0/dist.tar', sha256: 'b'.repeat(64) },
    },
    state: 'update_available',
    installedAppUuid: 'viz-1',
    installedRegistryVersion: '1.2.0',
    installedCreatedByUserUuid: 'user-1',
};

const mockImpact = (
    overrides: Partial<ReturnType<typeof useDataAppVizUpgradeImpact>> = {},
) => {
    vi.mocked(useDataAppVizUpgradeImpact).mockReturnValue({
        data: { chartCount: 4, pinnedChartCount: 3 },
        isFetching: false,
        isError: false,
        refetch: refetchImpact,
        ...overrides,
    } as ReturnType<typeof useDataAppVizUpgradeImpact>);
};

const renderModal = () =>
    renderWithProviders(
        <ChartTypeUpgradeModal
            projectUuid="project-1"
            dataAppViz={viz}
            registryUpdate={registryUpdate}
            onClose={onClose}
        />,
    );

describe('ChartTypeUpgradeModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useInstallRegistryChartType).mockReturnValue({
            mutate: upgrade,
            isLoading: false,
        } as unknown as ReturnType<typeof useInstallRegistryChartType>);
        mockImpact();
    });

    it('shows the blast radius and upgrades without moving charts by default', async () => {
        renderModal();

        expect(
            screen.getByText('4 saved charts use this chart type'),
        ).toBeInTheDocument();
        expect(screen.getByText(/3 of them are pinned/)).toBeInTheDocument();
        expect(useDataAppVizUpgradeImpact).toHaveBeenCalledWith(
            'project-1',
            'viz-1',
        );

        const button = screen.getByRole('button', { name: 'Upgrade' });
        await waitFor(() => expect(button).toBeEnabled());
        fireEvent.click(button);
        expect(upgrade).toHaveBeenCalledWith(
            {
                projectUuid: 'project-1',
                chartSlug: 'sankey',
                upgradeConsumingCharts: false,
            },
            expect.anything(),
        );
    });

    it('moves pinned charts when the option is checked', async () => {
        renderModal();

        fireEvent.click(
            screen.getByRole('checkbox', {
                name: /Also move all 3 pinned charts to v1\.3\.0/,
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));

        await waitFor(() =>
            expect(upgrade).toHaveBeenCalledWith(
                {
                    projectUuid: 'project-1',
                    chartSlug: 'sankey',
                    upgradeConsumingCharts: true,
                },
                expect.anything(),
            ),
        );
    });

    it('clearly identifies a chart type without consumers', () => {
        mockImpact({ data: { chartCount: 0, pinnedChartCount: 0 } });
        renderModal();

        expect(
            screen.getByText('No saved charts use this chart type.'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('offers no bulk move when nothing is pinned', () => {
        mockImpact({ data: { chartCount: 2, pinnedChartCount: 0 } });
        renderModal();

        expect(
            screen.getByText(/None of them pin a version/),
        ).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('uses singular copy for a single pinned consumer', () => {
        mockImpact({ data: { chartCount: 1, pinnedChartCount: 1 } });
        renderModal();

        expect(
            screen.getByText('1 saved chart uses this chart type'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', {
                name: /Also move the pinned chart to v1\.3\.0/,
            }),
        ).toBeInTheDocument();
    });

    it('blocks the upgrade while the impact is loading', () => {
        mockImpact({ data: undefined, isFetching: true });
        renderModal();

        expect(screen.getByRole('status')).toHaveTextContent(
            'Checking saved charts',
        );
        expect(screen.getByRole('button', { name: 'Upgrade' })).toBeDisabled();
    });

    it('offers retry and blocks the upgrade when the impact cannot be checked', () => {
        mockImpact({ data: undefined, isError: true });
        renderModal();

        expect(
            screen.getByText('Could not check affected charts'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Upgrade' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(refetchImpact).toHaveBeenCalledOnce();
        expect(upgrade).not.toHaveBeenCalled();
    });
});
