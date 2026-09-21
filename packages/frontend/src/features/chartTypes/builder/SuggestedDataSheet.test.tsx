import {
    DimensionType,
    FieldType,
    getItemId,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type Item,
    type ItemsMap,
    type SuggestedChartTypeData,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import SuggestedDataSheet from './SuggestedDataSheet';

// The real select is a Mantine combobox; a native one carries the same
// contract and is the harness the other field-select tests use.
vi.mock('../../../components/common/FieldSelect', () => ({
    default: ({
        'aria-label': ariaLabel,
        items,
        onChange,
    }: {
        'aria-label': string;
        items: Item[];
        onChange: (item: Item | undefined) => void;
    }) => (
        <select
            aria-label={ariaLabel}
            onChange={(event) =>
                onChange(
                    items.find(
                        (item) => getItemId(item) === event.target.value,
                    ),
                )
            }
        >
            <option value="">Choose a field</option>
            {items.map((item) => (
                <option key={getItemId(item)} value={getItemId(item)}>
                    {getItemId(item)}
                </option>
            ))}
        </select>
    ),
}));

const dimension = (name: string, label: string): CompiledDimension =>
    ({
        compiledSql: '',
        tablesReferences: [],
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name,
        label,
        table: 'customers',
        tableLabel: 'Customers',
        sql: '',
        hidden: false,
    }) as CompiledDimension;

const metric = (name: string, label: string): CompiledMetric =>
    ({
        compiledSql: '',
        tablesReferences: [],
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
        name,
        label,
        table: 'customers',
        tableLabel: 'Customers',
        sql: '',
        hidden: false,
    }) as CompiledMetric;

const itemsMap: ItemsMap = {
    customers_channel: dimension('channel', 'Acquisition channel'),
    customers_plan: dimension('plan', 'Plan'),
    customers_count: metric('count', 'Unique customer count'),
};

const suggested: SuggestedChartTypeData = {
    kind: 'suggested',
    exploreName: 'customers',
    exploreLabel: 'Customers',
    shapeSummary: 'A Sankey needs one row per source and target pair.',
    fits: true,
    alternatives: [
        {
            exploreName: 'orders',
            exploreLabel: 'Orders',
            summary: 'first order channel',
        },
    ],
    inputs: [
        {
            name: 'source',
            label: 'Source',
            type: 'dimension',
            required: true,
            fieldId: 'customers_channel',
            fieldLabel: 'Acquisition channel',
            fieldType: 'dimension',
            reason: 'Matches acquisition channel',
        },
        {
            name: 'value',
            label: 'Value',
            type: 'metric',
            required: true,
            fieldId: 'customers_count',
            fieldLabel: 'Unique customer count',
            fieldType: 'metric',
            reason: 'Counts customers per pair',
        },
    ],
};

const renderSheet = (
    props: Partial<React.ComponentProps<typeof SuggestedDataSheet>> = {},
) => {
    const handlers = {
        onSetField: vi.fn(),
        onChooseAlternative: vi.fn(),
        onUseSampleData: vi.fn(),
        onSomethingElse: vi.fn(),
        onRunOnceAndBuild: vi.fn(),
    };
    const view = renderWithProviders(
        <SuggestedDataSheet
            data={suggested}
            fieldMapping={{
                source: 'customers_channel',
                value: 'customers_count',
            }}
            itemsMap={itemsMap}
            fit={{ status: 'fits' }}
            isRunning={false}
            runError={null}
            {...handlers}
            {...props}
        />,
    );
    return { ...view, ...handlers };
};

/** Mantine stamps `data-variant` for every variant but the filled default. */
const filledButtons = () =>
    screen
        .getAllByRole('button')
        .filter(
            (button) =>
                button.classList.contains('mantine-Button-root') &&
                !button.hasAttribute('data-variant'),
        );

describe('SuggestedDataSheet', () => {
    it('says what it found and why each input is bound the way it is', () => {
        renderSheet();

        expect(screen.getByText('Data for this chart')).toBeInTheDocument();
        expect(screen.getByText('Shape fits')).toBeInTheDocument();
        expect(screen.getByText(/A Sankey needs one row/)).toBeInTheDocument();
        expect(screen.getByText('Customers')).toBeInTheDocument();
        expect(screen.getByText('Source')).toBeInTheDocument();
        expect(screen.getByText('Acquisition channel')).toBeInTheDocument();
        expect(
            screen.getByText('Matches acquisition channel'),
        ).toBeInTheDocument();
        expect(screen.getByText('Unique customer count')).toBeInTheDocument();
        expect(
            screen.getByText('Counts customers per pair'),
        ).toBeInTheDocument();
    });

    it('says which input nothing was found for', () => {
        renderSheet({ fieldMapping: { source: 'customers_channel' } });

        expect(screen.getByText('No match')).toBeInTheDocument();
    });

    it('changes one input without touching the others', () => {
        const { onSetField } = renderSheet();

        fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[1]);
        fireEvent.change(screen.getByLabelText('Field for Value'), {
            target: { value: 'customers_count' },
        });

        expect(onSetField).toHaveBeenCalledWith('value', 'customers_count');
        expect(onSetField).toHaveBeenCalledTimes(1);
    });

    it('counts the inputs left to fix once the explore disagrees', () => {
        renderSheet({
            fit: {
                status: 'doesNotFit',
                issues: [
                    {
                        fieldName: 'value',
                        label: 'Value',
                        expects: 'metric',
                        mapped: null,
                    },
                ],
            },
        });

        expect(screen.getByText('1 input to fix')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Run once and build' }),
        ).toBeDisabled();
    });

    it('asks again inside an explore that was also considered', () => {
        const { onChooseAlternative } = renderSheet();

        expect(screen.getByText('Also considered')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Orders, first order channel',
            }),
        );

        expect(onChooseAlternative).toHaveBeenCalledWith('orders');
    });

    it('offers one way forward, beside the two that change the data', () => {
        const { onRunOnceAndBuild, onUseSampleData, onSomethingElse } =
            renderSheet();

        expect(filledButtons()).toHaveLength(1);
        fireEvent.click(
            screen.getByRole('button', { name: 'Run once and build' }),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Use sample data instead' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Something else' }));

        expect(onRunOnceAndBuild).toHaveBeenCalledOnce();
        expect(onUseSampleData).toHaveBeenCalledOnce();
        expect(onSomethingElse).toHaveBeenCalledOnce();
    });

    it('reports a failed run and leaves the round to retry', () => {
        renderSheet({ runError: 'Column does not exist' });

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Column does not exist',
        );
        expect(
            screen.getByRole('button', { name: 'Run once and build' }),
        ).toBeEnabled();
    });

    it('waits without a map while the request is in flight', () => {
        renderSheet({ data: null });

        expect(
            screen.getByRole('status', { name: 'Finding data for this chart' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Data for this chart')).toBeNull();
    });

    it('makes sample data the only way forward when there is no data', () => {
        const { onUseSampleData } = renderSheet({
            data: { kind: 'no_data', reason: 'No explore has a plan column.' },
        });

        expect(
            screen.getByText('No explore has a plan column.'),
        ).toBeInTheDocument();
        const filled = filledButtons();
        expect(filled).toHaveLength(1);
        expect(filled[0]).toHaveTextContent('Use sample data instead');
        fireEvent.click(filled[0]);

        expect(onUseSampleData).toHaveBeenCalledOnce();
        expect(
            screen.queryByRole('button', { name: 'Run once and build' }),
        ).toBeNull();
    });

    it('keeps the map to the binding the preview would query', () => {
        renderSheet({
            fieldMapping: {
                source: 'customers_plan',
                value: 'customers_count',
            },
        });

        const rows = screen.getAllByRole('row');
        expect(within(rows[1]).getByText('Plan')).toBeInTheDocument();
    });

    it('says nothing about the fit until the explore has been read', () => {
        renderSheet({ fit: { status: 'resolving' }, itemsMap: {} });

        expect(screen.getByText('Checking fit…')).toBeInTheDocument();
        expect(screen.queryByText('Shape fits')).toBeNull();
        expect(screen.queryByText('No match')).toBeNull();
        // The suggestion's own words stand in while nothing can be named.
        expect(screen.getByText('Acquisition channel')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Run once and build' }),
        ).toBeDisabled();
    });

    it('says a field was filled in rather than suggested', () => {
        renderSheet({
            data: {
                ...suggested,
                inputs: [
                    suggested.inputs[0],
                    {
                        ...suggested.inputs[1],
                        fieldId: null,
                        fieldLabel: null,
                        fieldType: null,
                        reason: 'Nothing in this explore counts customers',
                    },
                ],
            },
        });

        expect(
            screen.getByText('Filled from this explore'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Nothing in this explore counts customers'),
        ).toBeNull();
    });

    it('names a field the author picked instead', () => {
        renderSheet({
            fieldMapping: {
                source: 'customers_plan',
                value: 'customers_count',
            },
        });

        expect(screen.getByText('Chosen by you')).toBeInTheDocument();
        expect(screen.queryByText('Matches acquisition channel')).toBeNull();
    });
});
