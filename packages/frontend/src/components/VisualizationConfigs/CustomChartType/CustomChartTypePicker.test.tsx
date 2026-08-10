import { type DataAppViz } from '@lightdash/common';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataAppVisualizations } from '../../../features/apps/hooks/useDataAppVisualizations';
import { renderWithProviders } from '../../../testing/testUtils';
import { type CustomChartTypeOption } from './customChartTypeOption';
import CustomChartTypePicker from './CustomChartTypePicker';

vi.mock('../../../features/apps/hooks/useDataAppVisualizations', () => ({
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
    onSelectDraft?: () => void;
    onClear?: (() => void) | null;
};

const render = (
    handlers: Handlers = {},
    options: {
        selected?: CustomChartTypeOption | null;
        selectedDataAppViz?: DataAppViz | null;
        draft?: { dataAppVizUuid: string; elapsed: string | null } | null;
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
            draft={options.draft ?? null}
            onSelectVega={handlers.onSelectVega ?? vi.fn()}
            onSelectProjectType={handlers.onSelectProjectType ?? vi.fn()}
            onSelectDraft={handlers.onSelectDraft ?? vi.fn()}
            onClear={
                handlers.onClear === undefined ? vi.fn() : handlers.onClear
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

    it('lists a build in flight, which the server cannot return yet', () => {
        setData([]);
        render({}, { draft: { dataAppVizUuid: 'draft-1', elapsed: '0:12' } });
        openDropdown();

        expect(screen.getByText('Untitled chart type')).toBeDefined();
        expect(
            screen.getByText('Building… available when ready'),
        ).toBeDefined();
    });

    // Otherwise the field falls back to its placeholder while a build runs,
    // reading as though nothing is happening.
    it('names the build in flight in the field, not just the list', () => {
        setData([]);
        render(
            {},
            {
                selected: { kind: 'projectType', dataAppVizUuid: 'draft-1' },
                draft: { dataAppVizUuid: 'draft-1', elapsed: '0:12' },
            },
        );

        expect(screen.getByDisplayValue('Untitled chart type')).toBeDefined();
    });

    it('reports picking the build in flight separately: it is not a type yet', () => {
        setData([]);
        const onSelectDraft = vi.fn();
        const onSelectProjectType = vi.fn();
        render(
            { onSelectDraft, onSelectProjectType },
            { draft: { dataAppVizUuid: 'draft-1', elapsed: null } },
        );
        openDropdown();

        fireEvent.click(screen.getByText('Untitled chart type'));

        expect(onSelectDraft).toHaveBeenCalledTimes(1);
        expect(onSelectProjectType).not.toHaveBeenCalled();
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

    // Creating is an action, not a chart type: it clears the selection, and
    // nothing selected is what puts the composer on screen.
    it('creates by clearing the selection, without landing on a type', () => {
        setData([]);
        const onClear = vi.fn();
        const onSelectProjectType = vi.fn();
        const onSelectVega = vi.fn();
        render({ onClear, onSelectProjectType, onSelectVega });
        openDropdown();

        fireEvent.click(screen.getByText('Create new chart type'));

        expect(onClear).toHaveBeenCalledTimes(1);
        expect(onSelectProjectType).not.toHaveBeenCalled();
        expect(onSelectVega).not.toHaveBeenCalled();
    });

    it('hides the create action where a new type cannot be described', () => {
        setData([]);
        render({ onClear: null });
        openDropdown();

        expect(screen.queryByText('Create new chart type')).toBeNull();
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

    it('offers no clear where a new type cannot be described', () => {
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
