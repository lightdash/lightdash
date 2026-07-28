import { type DataAppViz } from '@lightdash/common';
import { act, fireEvent, screen } from '@testing-library/react';
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
        colorPalette: null,
    },
    createdAt: new Date('2026-06-30'),
    createdByUserUuid: 'user-1',
    ...overrides,
});

const setData = (data: DataAppViz[]) => {
    mockedUseDataAppVisualizations.mockReturnValue({
        data: { pages: [{ data }], pageParams: [1] },
        isInitialLoading: false,
        isFetching: false,
        error: null,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        isFetchingNextPage: false,
    } as unknown as ReturnType<typeof useDataAppVisualizations>);
};

const render = (
    onSelect: (id: string | null) => void,
    selected: DataAppViz | null = null,
) =>
    renderWithProviders(
        <DataAppVizLibraryPicker
            projectUuid="project-1"
            selectedDataAppVizUuid={selected?.dataAppVizUuid ?? null}
            selectedDataAppViz={selected}
            onSelect={onSelect}
        />,
    );

// Options live in the Select dropdown, which only mounts once opened.
const openDropdown = () =>
    fireEvent.click(screen.getByPlaceholderText('Select a visualization'));

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
        openDropdown();

        expect(screen.getByText('Radial gauge')).toBeDefined();
        expect(screen.getByText('Bar race')).toBeDefined();
    });

    it('returns the selected viz uuid on click', () => {
        setData([
            makeDataAppViz({ dataAppVizUuid: 'picked', name: 'Pick me' }),
        ]);
        const onSelect = vi.fn();
        render(onSelect);
        openDropdown();

        fireEvent.click(screen.getByText('Pick me'));

        expect(onSelect).toHaveBeenCalledWith('picked');
    });

    it('lists the whole library while the input still holds the selected label', () => {
        vi.useFakeTimers();
        try {
            const selected = makeDataAppViz({
                dataAppVizUuid: 'a',
                name: 'Radial gauge',
            });
            setData([
                selected,
                makeDataAppViz({ dataAppVizUuid: 'b', name: 'Bar race' }),
            ]);
            render(vi.fn(), selected);
            // Mantine fills the input with the selected label on mount; let the
            // search debounce settle so a real query would have been issued.
            act(() => {
                vi.advanceTimersByTime(500);
            });
            openDropdown();

            expect(mockedUseDataAppVisualizations).toHaveBeenLastCalledWith(
                'project-1',
                '',
            );
            expect(screen.getByText('Bar race')).toBeDefined();
        } finally {
            vi.useRealTimers();
        }
    });

    it('clears the selection with the clear button', () => {
        const selected = makeDataAppViz({
            dataAppVizUuid: 'a',
            name: 'Radial gauge',
        });
        setData([selected]);
        const onSelect = vi.fn();
        const { container } = render(onSelect, selected);

        // Mantine's clear button is aria-hidden, so it isn't role-queryable.
        const clearButton = container.querySelector(
            '.mantine-8-InputClearButton-root',
        );
        expect(clearButton).not.toBeNull();
        fireEvent.click(clearButton!);

        expect(onSelect).toHaveBeenCalledWith(null);
    });

    it('shows an empty state when there are no bindable vizs', () => {
        setData([]);
        render(vi.fn());
        openDropdown();

        expect(
            screen.getByText(/No data app visualizations yet/),
        ).toBeDefined();
    });
});
