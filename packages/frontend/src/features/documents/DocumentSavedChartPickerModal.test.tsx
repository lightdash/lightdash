import { ChartKind, ChartSourceType } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../testing/testUtils';
import DocumentSavedChartPickerModal from './DocumentSavedChartPickerModal';

const mocks = vi.hoisted(() => ({ charts: [] as unknown[] }));
vi.mock('../../hooks/useChartSummariesV2', () => ({
    useChartSummariesV2: () => ({
        data: { pages: [{ data: mocks.charts }] },
        isFetching: false,
    }),
}));

const summary = (
    name: string,
    source: ChartSourceType,
    dashboard: { uuid: string; name: string } | null = null,
) => ({
    uuid: `${name}-uuid`,
    name,
    source,
    chartKind: ChartKind.VERTICAL_BAR,
    space: { uuid: 'space', name: 'Finance' },
    dashboard,
});

const renderPicker = ({ canCopyChart = true } = {}) => {
    const onLink = vi.fn();
    renderWithProviders(
        <DocumentSavedChartPickerModal
            projectUuid="project"
            canCopyChart={canCopyChart}
            onClose={vi.fn()}
            onLink={onLink}
            onCopy={vi.fn()}
        />,
    );
    return { onLink };
};

const choose = async (name: string) => {
    fireEvent.click(screen.getByPlaceholderText('Search saved charts'));
    fireEvent.click(await screen.findByRole('option', { name }));
};

beforeEach(() => {
    mocks.charts = [
        summary('Revenue', ChartSourceType.DBT_EXPLORE),
        summary('Revenue SQL', ChartSourceType.SQL),
        summary('Tile only', ChartSourceType.DBT_EXPLORE, {
            uuid: 'dashboard',
            name: 'Board',
        }),
    ];
});

it("doesn't offer charts saved in a dashboard", async () => {
    renderPicker();
    fireEvent.click(screen.getByPlaceholderText('Search saved charts'));
    expect(
        await screen.findByRole('option', { name: 'Revenue' }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole('option', { name: 'Tile only' }),
    ).not.toBeInTheDocument();
});

it('links the chosen SQL chart by uuid', async () => {
    const { onLink } = renderPicker();
    await choose('Revenue SQL');
    fireEvent.click(screen.getByRole('button', { name: 'Link chart' }));
    expect(onLink).toHaveBeenCalledExactlyOnceWith(
        'sqlChart',
        'Revenue SQL-uuid',
    );
});

it('only links SQL charts', async () => {
    renderPicker();
    await choose('Revenue SQL');
    expect(screen.getByRole('radio', { name: 'Copy' })).toBeDisabled();
});

it('only offers a copy the user could author', async () => {
    renderPicker({ canCopyChart: false });
    await choose('Revenue');
    expect(screen.getByRole('radio', { name: 'Copy' })).toBeDisabled();
});

it('copies a chart when the user can author it', async () => {
    renderPicker();
    await choose('Revenue');
    expect(screen.getByRole('radio', { name: 'Copy' })).toBeEnabled();
});
