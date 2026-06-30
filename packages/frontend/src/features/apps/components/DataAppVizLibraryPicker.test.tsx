import { type DataAppViz } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useDataAppVisualizations } from '../hooks/useDataAppVisualizations';
import DataAppVizLibraryPicker from './DataAppVizLibraryPicker';

vi.mock('../hooks/useDataAppVisualizations', () => ({
    useDataAppVisualizations: vi.fn(),
}));

const mockedUseDataAppVisualizations = vi.mocked(useDataAppVisualizations);

const makeDataAppViz = (overrides: Partial<DataAppViz>): DataAppViz => ({
    dataAppVizUuid: 'data-app-viz-1',
    name: 'Radial gauge',
    description: '',
    projectUuid: 'project-1',
    spaceUuid: null,
    schema: {
        fields: [{ name: 'v', label: 'V', type: 'metric', required: true }],
        configOptions: [],
    },
    createdAt: new Date('2026-06-30'),
    createdByUserUuid: 'user-1',
    ...overrides,
});

const setData = (data: DataAppViz[]) => {
    mockedUseDataAppVisualizations.mockReturnValue({
        data: { pages: [{ data }], pageParams: [1] },
        isInitialLoading: false,
        error: null,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        isFetchingNextPage: false,
    } as unknown as ReturnType<typeof useDataAppVisualizations>);
};

const render = (onSelect: (id: string) => void): ReactElement =>
    renderWithProviders(
        <DataAppVizLibraryPicker
            projectUuid="project-1"
            selectedDataAppVizUuid={null}
            onSelect={onSelect}
        />,
    ) as unknown as ReactElement;

describe('DataAppVizLibraryPicker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lists the vizs returned by the endpoint', () => {
        setData([
            makeDataAppViz({ dataAppVizUuid: 'a', name: 'Radial gauge' }),
            makeDataAppViz({ dataAppVizUuid: 'b', name: 'Bar race' }),
        ]);
        render(vi.fn());

        expect(screen.getByText('Radial gauge')).toBeDefined();
        expect(screen.getByText('Bar race')).toBeDefined();
    });

    it('returns the selected viz uuid on click', () => {
        setData([
            makeDataAppViz({ dataAppVizUuid: 'picked', name: 'Pick me' }),
        ]);
        const onSelect = vi.fn();
        render(onSelect);

        fireEvent.click(screen.getByText('Pick me'));

        expect(onSelect).toHaveBeenCalledWith('picked');
    });

    it('shows an empty state when there are no bindable vizs', () => {
        setData([]);
        render(vi.fn());

        expect(
            screen.getByText(/No data app visualizations yet/),
        ).toBeDefined();
    });
});
