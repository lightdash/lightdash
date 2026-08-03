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
    onSelect: (dataAppViz: DataAppViz | null) => void,
    selected: DataAppViz | null = null,
    extra: {
        draft?: { dataAppVizUuid: string; elapsed: string | null };
        onSelectDraft?: () => void;
    } = {},
) =>
    renderWithProviders(
        <DataAppVizLibraryPicker
            projectUuid="project-1"
            selectedDataAppVizUuid={selected?.dataAppVizUuid ?? null}
            selectedDataAppViz={selected}
            disabled={false}
            draft={extra.draft ?? null}
            onSelectDraft={extra.onSelectDraft ?? vi.fn()}
            onSelect={onSelect}
        />,
    );

const rightSectionPointerEvents = (container: HTMLElement) =>
    container
        .querySelector<HTMLElement>('.mantine-8-Input-wrapper')
        ?.style.getPropertyValue('--input-right-section-pointer-events');

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

    it('returns the whole selected viz on click, contract included', () => {
        const picked = makeDataAppViz({
            dataAppVizUuid: 'picked',
            name: 'Pick me',
        });
        setData([picked]);
        const onSelect = vi.fn();
        render(onSelect);
        openDropdown();

        fireEvent.click(screen.getByText('Pick me'));

        // The caller binds the contract straight away, so it needs the schema
        // and not just the uuid.
        expect(onSelect).toHaveBeenCalledWith(picked);
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

    it('leaves the clear button clickable', () => {
        const selected = makeDataAppViz({ dataAppVizUuid: 'a' });
        setData([selected]);
        const { container } = render(vi.fn(), selected);

        expect(rightSectionPointerEvents(container)).not.toBe('none');
    });

    it('keeps the draft badge out of the way of pointer events', () => {
        setData([]);
        const { container } = render(vi.fn(), null, {
            draft: { dataAppVizUuid: 'building-1', elapsed: '0:12' },
        });

        expect(rightSectionPointerEvents(container)).toBe('none');
    });

    it('lists a build in flight, which the server cannot return yet', () => {
        setData([]);
        render(vi.fn(), null, {
            draft: { dataAppVizUuid: 'draft-1', elapsed: '0:12' },
        });
        openDropdown();

        expect(screen.getByText('Untitled visualization')).toBeDefined();
        expect(screen.getByText('building 0:12')).toBeDefined();
    });

    it('reports picking the draft separately: it is not a viz yet', () => {
        setData([]);
        const onSelect = vi.fn();
        const onSelectDraft = vi.fn();
        render(onSelect, null, {
            draft: { dataAppVizUuid: 'draft-1', elapsed: null },
            onSelectDraft,
        });
        openDropdown();
        fireEvent.click(screen.getByText('Untitled visualization'));

        expect(onSelectDraft).toHaveBeenCalledTimes(1);
        expect(onSelect).not.toHaveBeenCalled();
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
