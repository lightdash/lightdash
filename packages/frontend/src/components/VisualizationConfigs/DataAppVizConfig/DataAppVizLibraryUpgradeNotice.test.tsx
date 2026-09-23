import {
    type DataAppViz,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useRegistryChartTypes } from '../../../features/chartTypes/hooks/useRegistryChartTypes';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizLibraryUpgradeNotice from './DataAppVizLibraryUpgradeNotice';

vi.mock('../../../features/apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: vi.fn(),
}));
vi.mock('../../../features/chartTypes/hooks/useRegistryChartTypes', () => ({
    useRegistryChartTypes: vi.fn(),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));
vi.mock(
    '../../../features/chartTypes/components/ChartTypeUpgradeModal',
    () => ({
        default: ({ onClose }: { onClose: () => void }) => (
            <div role="dialog">
                <button onClick={onClose}>Close upgrade</button>
            </div>
        ),
    }),
);

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
    vizSchema: { fields: [], configOptions: [], colorPalette: null },
    preview: null,
    thumbnail: null,
    thumbnailDark: null,
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

const mockRegistry = (
    charts: RegistryChartTypeListItem[],
    registryEnabled = true,
) => {
    vi.mocked(useRegistryChartTypes).mockReturnValue({
        data: { registryEnabled, charts },
    } as ReturnType<typeof useRegistryChartTypes>);
};

const renderNotice = () =>
    renderWithProviders(
        <DataAppVizLibraryUpgradeNotice
            projectUuid="project-1"
            dataAppViz={viz}
        />,
    );

describe('DataAppVizLibraryUpgradeNotice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useCanCreateDataApp).mockReturnValue(true);
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { enabled: true },
        } as ReturnType<typeof useServerFeatureFlag>);
        mockRegistry([registryUpdate]);
    });

    it('shows the release information and opens the existing upgrade confirmation', () => {
        renderNotice();
        expect(
            screen.getByText('Update available: v1.3.0'),
        ).toBeInTheDocument();
        expect(screen.getByText('Adds link labels')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Upgrade to v1.3.0' }),
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close upgrade' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows upgrade information without an action for users without permission', () => {
        vi.mocked(useCanCreateDataApp).mockReturnValue(false);
        renderNotice();
        expect(
            screen.getByText('Update available: v1.3.0'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it.each(['installed', 'incompatible'] as const)(
        'hides the notice when the registry state is %s',
        (state) => {
            mockRegistry([{ ...registryUpdate, state }]);
            renderNotice();
            expect(
                screen.queryByText(/Update available/),
            ).not.toBeInTheDocument();
        },
    );

    it('does not offer an upgrade belonging to another installed chart type', () => {
        mockRegistry([{ ...registryUpdate, installedAppUuid: 'another-viz' }]);
        renderNotice();
        expect(screen.queryByText(/Update available/)).not.toBeInTheDocument();
    });

    it('hides the notice when the registry is disabled', () => {
        mockRegistry([registryUpdate], false);
        renderNotice();
        expect(screen.queryByText(/Update available/)).not.toBeInTheDocument();
    });

    it('disables fetching and hides cached offers when the feature flag is off', () => {
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { enabled: false },
        } as ReturnType<typeof useServerFeatureFlag>);
        renderNotice();
        expect(useRegistryChartTypes).toHaveBeenCalledWith('project-1', false);
        expect(screen.queryByText(/Update available/)).not.toBeInTheDocument();
    });
});
