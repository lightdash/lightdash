import { type DataAppViz } from '@lightdash/common';
import { screen } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../../../testing/testUtils';
import { useAppVersionHistory } from '../../apps/hooks/useAppVersionHistory';
import { useCanCreateDataApp } from '../../apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../apps/hooks/useCanEditDataApp';
import ChartTypeDetailModal from './ChartTypeDetailModal';

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useNavigate: () => vi.fn(),
}));
vi.mock('../../apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataApp: vi.fn(),
}));
vi.mock('../../apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: vi.fn(),
}));
vi.mock('../../apps/hooks/useAppVersionHistory', () => ({
    useAppVersionHistory: vi.fn(),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));
vi.mock('./ChartTypeSamplePreview', () => ({
    default: () => <div />,
}));

const viz: DataAppViz = {
    dataAppVizUuid: 'viz-1',
    slug: 'radial-gauge',
    name: 'Radial gauge',
    description: '',
    projectUuid: 'project-1',
    spaceUuid: null,
    schema: null,
    icon: null,
    createdAt: new Date(),
    createdByUserUuid: 'user-1',
    registrySlug: null,
};

const renderModal = () =>
    renderWithProviders(
        <MemoryRouter>
            <ChartTypeDetailModal
                opened
                projectUuid="project-1"
                dataAppViz={viz}
                isActive
                registryEntry={null}
                onClose={vi.fn()}
                onPreview={vi.fn()}
                onDelete={vi.fn()}
            />
        </MemoryRouter>,
    );

describe('ChartTypeDetailModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useCanCreateDataApp).mockReturnValue(true);
        vi.mocked(useAppVersionHistory).mockReturnValue({
            latestReadyVersion: null,
            oldest: null,
            latest: null,
            hasOrigin: false,
        } as unknown as ReturnType<typeof useAppVersionHistory>);
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { enabled: true },
        } as ReturnType<typeof useServerFeatureFlag>);
    });

    it('offers Edit when the user can manage the chart type', async () => {
        vi.mocked(useCanEditDataApp).mockReturnValue(true);
        renderModal();

        expect(
            await screen.findByRole('link', { name: 'Edit' }),
        ).toBeInTheDocument();
    });

    it('hides Edit when the user cannot manage the chart type', async () => {
        vi.mocked(useCanEditDataApp).mockReturnValue(false);
        renderModal();

        expect(
            await screen.findByRole('button', { name: 'Preview in explorer' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Edit' }),
        ).not.toBeInTheDocument();
    });
});
