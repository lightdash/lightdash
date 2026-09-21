import { type DataAppViz } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import { useDataAppVisualization } from '../../features/chartTypes/hooks/useDataAppVisualization';
import { renderWithProviders } from '../../testing/testUtils';
import ChartStudioReturnBanner from './ChartStudioReturnBanner';

vi.mock('../../features/chartTypes/hooks/useDataAppVisualization', () => ({
    useDataAppVisualization: vi.fn(),
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({ default: vi.fn() }));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'p1',
}));

const DATA_APP_VIZ_UUID = '1e9a3b2c-0000-4000-8000-000000000001';

const setChartType = (dataAppViz: Partial<DataAppViz> | null) =>
    vi.mocked(useDataAppVisualization).mockReturnValue({
        data: dataAppViz
            ? ({
                  dataAppVizUuid: DATA_APP_VIZ_UUID,
                  name: 'Customer flow Sankey',
                  ...dataAppViz,
              } as DataAppViz)
            : undefined,
    } as ReturnType<typeof useDataAppVisualization>);

const setEmbed = (embedToken: string | undefined) =>
    vi
        .mocked(useEmbed)
        .mockReturnValue({ embedToken } as ReturnType<typeof useEmbed>);

const renderBanner = (search: string, hidden = false) =>
    renderWithProviders(
        <MemoryRouter
            initialEntries={[`/projects/p1/tables/customers${search}`]}
        >
            <ChartStudioReturnBanner hidden={hidden} />
        </MemoryRouter>,
    );

const MARKER = `?fromChartStudio=${DATA_APP_VIZ_UUID}`;

describe('ChartStudioReturnBanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setChartType({});
        setEmbed(undefined);
    });

    it('offers a way back to the chart type Chart Studio sent it from', () => {
        renderBanner(MARKER);

        expect(
            screen.getByText(/is ready to use in this project/),
        ).toBeInTheDocument();
        expect(screen.getByText('Customer flow Sankey')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Back to Chart Studio' }),
        ).toHaveAttribute(
            'href',
            `/projects/p1/chart-types/${DATA_APP_VIZ_UUID}`,
        );
    });

    it('stays away without the marker', () => {
        renderBanner('');

        expect(screen.queryByText(/is ready to use/)).toBeNull();
    });

    it('stays away inside an embed', () => {
        setEmbed('embed-token');
        renderBanner(MARKER);

        expect(screen.queryByText(/is ready to use/)).toBeNull();
        // The host owns the embed url, so its marker never reaches the api.
        expect(vi.mocked(useDataAppVisualization).mock.calls).not.toHaveLength(
            0,
        );
        for (const call of vi.mocked(useDataAppVisualization).mock.calls) {
            expect(call[1]).toBeNull();
        }
    });

    it('stays away while the chart type has no name yet', () => {
        setChartType(null);
        renderBanner(MARKER);

        expect(screen.queryByText(/is ready to use/)).toBeNull();
    });

    it('goes away on dismiss', () => {
        renderBanner(MARKER);

        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

        expect(screen.queryByText(/is ready to use/)).toBeNull();
    });

    it('keeps a dismissal across a fullscreen toggle', () => {
        const view = renderBanner(MARKER);

        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        view.rerender(
            <MemoryRouter
                initialEntries={[`/projects/p1/tables/customers${MARKER}`]}
            >
                <ChartStudioReturnBanner hidden />
            </MemoryRouter>,
        );
        view.rerender(
            <MemoryRouter
                initialEntries={[`/projects/p1/tables/customers${MARKER}`]}
            >
                <ChartStudioReturnBanner hidden={false} />
            </MemoryRouter>,
        );

        expect(screen.queryByText(/is ready to use/)).toBeNull();
    });
});
