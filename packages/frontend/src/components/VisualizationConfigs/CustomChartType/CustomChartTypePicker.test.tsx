import { type DataAppViz } from '@lightdash/common';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataAppVisualizations } from '../../../features/chartTypes/hooks/useDataAppVisualizations';
import { renderWithProviders } from '../../../testing/testUtils';
import { type CustomChartTypeOption } from './customChartTypeOption';
import CustomChartTypePicker from './CustomChartTypePicker';

vi.mock('../../../features/chartTypes/hooks/useDataAppVisualizations', () => ({
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

type Handlers = {
    onSelectVega?: () => void;
    onSelectProjectType?: (dataAppViz: DataAppViz) => void;
    onClear?: (() => void) | null;
    onCreateNew?: (() => void) | null;
    onBrowseGallery?: (() => void) | null;
};

const render = (
    handlers: Handlers = {},
    options: {
        selected?: CustomChartTypeOption | null;
        selectedDataAppViz?: DataAppViz | null;
    } = {},
) =>
    renderWithProviders(
        <CustomChartTypePicker
            projectUuid="project-1"
            selected={
                options.selected === undefined
                    ? { kind: 'builtInVega' }
                    : options.selected
            }
            selectedDataAppViz={options.selectedDataAppViz ?? null}
            disabled={false}
            onSelectVega={handlers.onSelectVega ?? vi.fn()}
            onSelectProjectType={handlers.onSelectProjectType ?? vi.fn()}
            onClear={
                handlers.onClear === undefined ? vi.fn() : handlers.onClear
            }
            onCreateNew={
                handlers.onCreateNew === undefined
                    ? vi.fn()
                    : handlers.onCreateNew
            }
            onBrowseGallery={
                handlers.onBrowseGallery === undefined
                    ? vi.fn()
                    : handlers.onBrowseGallery
            }
        />,
    );

// Options live in the Select dropdown, which only mounts once opened.
const openDropdown = () =>
    fireEvent.click(screen.getByPlaceholderText('Search custom chart types…'));

describe('CustomChartTypePicker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Mantine's combobox scrolls the active option into view as the search
        // narrows the list; jsdom has no layout to scroll.
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('offers Vega and the project types under one list', () => {
        setData([makeDataAppViz({ dataAppVizUuid: 'a', name: 'Bar race' })]);
        render();
        openDropdown();

        expect(screen.getByText('Built in')).toBeDefined();
        expect(screen.getByText('Vega (JSON editor)')).toBeDefined();
        expect(screen.getByText('Project')).toBeDefined();
        expect(screen.getByText('Bar race')).toBeDefined();
    });

    it('reports going back to Vega separately: it is a different chart type', () => {
        const onProject = makeDataAppViz({
            dataAppVizUuid: 'a',
            name: 'Bar race',
        });
        setData([onProject]);
        const onSelectVega = vi.fn();
        const onSelectProjectType = vi.fn();
        render(
            { onSelectVega, onSelectProjectType },
            {
                selected: { kind: 'projectType', dataAppVizUuid: 'a' },
                selectedDataAppViz: onProject,
            },
        );
        openDropdown();

        fireEvent.click(screen.getByText('Vega (JSON editor)'));

        expect(onSelectVega).toHaveBeenCalledTimes(1);
        expect(onSelectProjectType).not.toHaveBeenCalled();
    });

    it('returns the whole project type on click, contract included', () => {
        const picked = makeDataAppViz({
            dataAppVizUuid: 'picked',
            name: 'Pick me',
        });
        setData([picked]);
        const onSelectProjectType = vi.fn();
        render({ onSelectProjectType });
        openDropdown();

        fireEvent.click(screen.getByText('Pick me'));

        // The caller binds the contract straight away, so it needs the schema
        // and not just the uuid.
        expect(onSelectProjectType).toHaveBeenCalledWith(picked);
    });

    it('searches the built-in group alongside the project types', () => {
        vi.useFakeTimers();
        try {
            setData([]);
            render();
            // The project search is served by the endpoint; the built-in entry
            // is filtered here, so a non-matching term must drop it from the
            // list once the shared debounce settles.
            fireEvent.change(
                screen.getByPlaceholderText('Search custom chart types…'),
                { target: { value: 'cohort' } },
            );
            act(() => {
                vi.advanceTimersByTime(500);
            });

            expect(screen.queryByText('Vega (JSON editor)')).toBeNull();
            expect(mockedUseDataAppVisualizations).toHaveBeenLastCalledWith(
                'project-1',
                'cohort',
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('hands creating a new chart type to the builder', () => {
        setData([]);
        const onCreateNew = vi.fn();
        const onSelectProjectType = vi.fn();
        const onSelectVega = vi.fn();
        render({ onCreateNew, onSelectProjectType, onSelectVega });
        openDropdown();

        fireEvent.click(screen.getByText('Create new chart type'));

        expect(onCreateNew).toHaveBeenCalledTimes(1);
        expect(onSelectProjectType).not.toHaveBeenCalled();
        expect(onSelectVega).not.toHaveBeenCalled();
    });

    it('hides the create action where a new type cannot be created', () => {
        setData([]);
        render({ onCreateNew: null });
        openDropdown();

        expect(screen.queryByText('Create new chart type')).toBeNull();
    });

    it('hands browsing off to the gallery from the footer', () => {
        setData([]);
        const onBrowseGallery = vi.fn();
        const onSelectProjectType = vi.fn();
        render({ onBrowseGallery, onSelectProjectType });
        openDropdown();

        fireEvent.click(screen.getByText('Browse the gallery'));

        expect(onBrowseGallery).toHaveBeenCalledTimes(1);
        expect(onSelectProjectType).not.toHaveBeenCalled();
    });

    it('hides the browse action where the gallery is not reachable', () => {
        setData([]);
        render({ onBrowseGallery: null });
        openDropdown();

        expect(screen.queryByText('Browse the gallery')).toBeNull();
    });

    it('clears the selection from the field too', () => {
        setData([]);
        const onClear = vi.fn();
        const onSelectVega = vi.fn();
        render({ onClear, onSelectVega });

        fireEvent.click(screen.getByLabelText('Clear custom chart type'));

        expect(onClear).toHaveBeenCalledTimes(1);
        // Clearing is not landing on a chart type.
        expect(onSelectVega).not.toHaveBeenCalled();
    });

    it('offers no clear once nothing is selected', () => {
        setData([]);
        render({}, { selected: null });

        expect(screen.queryByLabelText('Clear custom chart type')).toBeNull();
    });

    it('offers no clear where an empty selection is not allowed', () => {
        setData([]);
        render({ onClear: null });

        expect(screen.queryByLabelText('Clear custom chart type')).toBeNull();
    });

    // An emptied search has to stay empty. Treating it as "not searching" put
    // the selected label straight back, so the text could never be deleted.
    it('lets the search be emptied rather than snapping back to the label', () => {
        const onProject = makeDataAppViz({
            dataAppVizUuid: 'a',
            name: 'Bar race',
        });
        setData([onProject]);
        render(
            {},
            {
                selected: { kind: 'projectType', dataAppVizUuid: 'a' },
                selectedDataAppViz: onProject,
            },
        );

        const field = screen.getByDisplayValue('Bar race');
        fireEvent.change(field, { target: { value: 'Bar rac' } });
        fireEvent.change(field, { target: { value: '' } });

        expect(field).toHaveValue('');
    });
});
