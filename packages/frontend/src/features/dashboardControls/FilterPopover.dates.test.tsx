import {
    DimensionType,
    FieldType,
    FilterOperator,
    TimeFrames,
    type FilterableDimension,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC, type SetStateAction } from 'react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MantineProvider from '../../providers/MantineProvider';
import {
    createDashboardTestStore,
    seedDashboardEditState,
    type DashboardEditTestValues,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import {
    dashboardFiltersActions,
    selectDashboardFilters,
    selectHaveFiltersChanged,
    type DashboardStore,
} from '../dashboard/store';
import { ControlsEditorProvider } from './ControlsEditorProvider';
import { EditorPopover } from './FilterEditor';
import { useControlsEditorSelector } from './useControlsEditor';

// A day picked in a date calendar must leave the flag-on editor open with
// the value set: the real popover, provider and value inputs, with Mantine's
// dropdowns portalled to the body as in the browser

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useParams: () => ({ mode: 'edit' }),
}));
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({ data: undefined }),
}));

const field = (name: string, type: DimensionType): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label: name === 'order_date' ? 'Order date' : name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
});
const dateField = field('order_date', DimensionType.DATE);
const timestampField = field('created_at', DimensionType.TIMESTAMP);
const statusField = field('status', DimensionType.STRING);
const weekField: FilterableDimension = {
    ...field('order_week', DimensionType.DATE),
    label: 'Order week',
    timeInterval: TimeFrames.WEEK,
};
const intervalField = (
    name: string,
    label: string,
    timeInterval: TimeFrames,
): FilterableDimension => ({
    ...field(name, DimensionType.DATE),
    label,
    timeInterval,
});
const monthField = intervalField(
    'order_month',
    'Order month',
    TimeFrames.MONTH,
);
const quarterField = intervalField(
    'order_quarter',
    'Order quarter',
    TimeFrames.QUARTER,
);
const yearField = intervalField('order_year', 'Order year', TimeFrames.YEAR);
const fields = [
    dateField,
    timestampField,
    statusField,
    weekField,
    monthField,
    quarterField,
    yearField,
];

const rule = (
    fieldName: string,
    operator: FilterOperator,
    values: unknown[],
): DashboardFilterRule => ({
    id: 'filter-1',
    label: undefined,
    operator,
    target: { fieldId: `orders_${fieldName}`, tableName: 'orders' },
    values,
});

const setters = (store: DashboardStore) => ({
    setDashboardFilters: (value: SetStateAction<DashboardFilters>) =>
        store.dispatch(
            dashboardFiltersActions.setDashboardFilters(
                typeof value === 'function'
                    ? value(selectDashboardFilters(store.getState()))
                    : value,
            ),
        ),
    setHaveFiltersChanged: (value: SetStateAction<boolean>) =>
        store.dispatch(
            dashboardFiltersActions.setHaveFiltersChanged(
                typeof value === 'function'
                    ? value(selectHaveFiltersChanged(store.getState()))
                    : value,
            ),
        ),
});

// The bar's pill: it opens the editor, which anchors on it
const Pill: FC = () => {
    const open = useControlsEditorSelector((c) => c.open);
    const isOpen = useControlsEditorSelector((c) => c.isEditorOpen);
    return (
        <EditorPopover isOpen={isOpen}>
            <button
                type="button"
                data-controls-pill="filter-1"
                onClick={() => open('filter-1')}
            >
                Pill
            </button>
        </EditorPopover>
    );
};

// The draft the editor holds, as Apply would write it
const Draft: FC<{ onRule: (rule: DashboardFilterRule | null) => void }> = ({
    onRule,
}) => {
    onRule(useControlsEditorSelector((c) => c.editingRule));
    return null;
};

const renderEditor = (savedRule: DashboardFilterRule) => {
    const store = seedDashboardEditState(
        createDashboardTestStore({
            dashboardFilters: {
                dimensions: [savedRule],
                metrics: [],
                tableCalculations: [],
            },
        }),
        { dashboardTiles: [{ uuid: 't1' }] } as DashboardEditTestValues,
    );
    mockDashboardContext.current = {
        ...setters(store),
        setDateZoomGranularity: vi.fn(),
        dashboard: {
            uuid: 'dash-1',
            tiles: [{ uuid: 't1' }],
            filters: {
                dimensions: [savedRule],
                metrics: [],
                tableCalculations: [],
            },
        },
        filterableFieldsByTileUuid: { t1: fields },
        allFilterableFields: fields,
        allFilterableFieldsMap: Object.fromEntries(
            fields.map((f) => [`orders_${f.name}`, f]),
        ),
        allFilterableMetricsMap: {},
    };
    const draft: { current: DashboardFilterRule | null } = { current: null };
    const Harness: FC = () => (
        <ControlsEditorProvider>
            <Pill />
            <Draft
                onRule={(next) => {
                    draft.current = next;
                }}
            />
            <button type="button">Outside</button>
        </ControlsEditorProvider>
    );
    renderWithProviders(
        // Mantine's test env renders dropdowns in place; the case under test
        // needs them portalled to the body
        <MantineProvider env="default">
            <DashboardStoreTestProvider store={store}>
                <Harness />
            </DashboardStoreTestProvider>
        </MantineProvider>,
    );
    return { draft };
};

// `hidden`: jsdom has no layout, so Mantine marks portalled dropdowns hidden
const editor = () =>
    screen.getByRole('dialog', {
        name: /Order date|Order week|Order month|Order quarter|Order year|created_at|status/,
        hidden: true,
    });

const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Pill' }));
    expect(editor()).toBeInTheDocument();
};

const pickDay = async (
    user: ReturnType<typeof userEvent.setup>,
    dayLabel: string,
    inputIndex = 0,
) => {
    const input =
        within(editor()).queryAllByRole('textbox', { hidden: true })[
            inputIndex
        ] ??
        within(editor()).getAllByRole('button', {
            name: /\d{4}-\d{2}-\d{2}/,
            hidden: true,
        })[inputIndex];
    await user.click(input);
    const day = await screen.findByRole('button', {
        name: dayLabel,
        hidden: true,
    });
    // Portalled: outside the editor, the case the dismiss rule must allow
    expect(editor()).not.toContainElement(day);
    await user.click(day);
};

describe('the flag-on filter popover with a date calendar', () => {
    beforeEach(() => {
        mockDashboardContext.current = {};
    });

    it('a date field: picking a day keeps the popover open with the value set', async () => {
        const user = userEvent.setup();
        const { draft } = renderEditor(
            rule('order_date', FilterOperator.LESS_THAN, ['2026-01-15']),
        );
        await openEditor(user);
        await pickDay(user, '20 January 2026');
        expect(editor()).toBeInTheDocument();
        expect(draft.current?.values).toStrictEqual(['2026-01-20']);
    });

    it('a timestamp field: picking a day keeps the popover open with the value set', async () => {
        const user = userEvent.setup();
        const { draft } = renderEditor(
            rule('created_at', FilterOperator.LESS_THAN, [
                '2026-01-15T00:00:00Z',
            ]),
        );
        await openEditor(user);
        await pickDay(user, '20 January 2026');
        expect(editor()).toBeInTheDocument();
        expect(String(draft.current?.values?.[0])).toMatch(/^2026-01-20/);
    });

    it('a week field: picking a day keeps the popover open with its week set', async () => {
        const user = userEvent.setup();
        const { draft } = renderEditor(
            rule('order_week', FilterOperator.LESS_THAN, ['2026-01-12']),
        );
        await openEditor(user);
        await pickDay(user, '21 January 2026');
        expect(editor()).toBeInTheDocument();
        // The week commencing the clicked day (weeks start on Sunday here)
        expect(draft.current?.values).toStrictEqual(['2026-01-18']);
    });

    // The multi-day calendar (the default "is" input) is a plain popover,
    // not one of the date inputs' dropdowns
    it.each([
        ['is', FilterOperator.EQUALS],
        ['is not', FilterOperator.NOT_EQUALS],
    ])(
        'a date field, "%s": picking a day in the multi-day calendar keeps the popover open with the day added',
        async (_name, operator) => {
            const user = userEvent.setup();
            const { draft } = renderEditor(
                rule('order_date', operator, ['2026-01-15']),
            );
            await openEditor(user);
            await pickDay(user, '20 January 2026');
            expect(editor()).toBeInTheDocument();
            expect(draft.current?.operator).toBe(operator);
            expect(draft.current?.values).toContain('2026-01-20');
        },
    );

    it('a month field: picking a month keeps the popover open with the month set', async () => {
        const user = userEvent.setup();
        const { draft } = renderEditor(
            rule('order_month', FilterOperator.LESS_THAN, ['2026-01-01']),
        );
        await openEditor(user);
        await user.click(
            within(editor())
                .getAllByRole('button', { hidden: true })
                .find((button) => /2026/.test(button.textContent ?? ''))!,
        );
        const month = await screen.findByRole('button', {
            name: /^Mar/,
            hidden: true,
        });
        expect(editor()).not.toContainElement(month);
        await user.click(month);
        expect(editor()).toBeInTheDocument();
        expect(draft.current?.values).toStrictEqual(['2026-03']);
    });

    it('a year field: picking a year keeps the popover open with the year set', async () => {
        const user = userEvent.setup();
        const { draft } = renderEditor(
            rule('order_year', FilterOperator.LESS_THAN, ['2026-01-01']),
        );
        await openEditor(user);
        await user.click(
            within(editor())
                .getAllByRole('button', { hidden: true })
                .find((button) =>
                    /^2026$/.test(button.textContent?.trim() ?? ''),
                )!,
        );
        const year = await screen.findByRole('button', {
            name: '2028',
            hidden: true,
        });
        expect(editor()).not.toContainElement(year);
        await user.click(year);
        expect(editor()).toBeInTheDocument();
        expect(draft.current?.values).toStrictEqual(['2028']);
    });

    it('a quarter field: picking a quarter keeps the popover open with the quarter set', async () => {
        const user = userEvent.setup();
        const { draft } = renderEditor(
            rule('order_quarter', FilterOperator.LESS_THAN, ['2026-01-01']),
        );
        await openEditor(user);
        await user.click(
            within(editor()).getByRole('textbox', { hidden: true }),
        );
        const april = await screen.findByRole('button', {
            name: /^Apr/,
            hidden: true,
        });
        expect(editor()).not.toContainElement(april);
        await user.click(april);
        expect(editor()).toBeInTheDocument();
        // The quarter's first day, Q2
        expect(String(draft.current?.values?.[0])).toMatch(/^2026-04-01/);
    });

    it('a date field, "is between": picking the start day then the end day keeps the popover open with both set', async () => {
        const user = userEvent.setup();
        const { draft } = renderEditor(
            rule('order_date', FilterOperator.IN_BETWEEN, [
                '2026-01-15',
                '2026-01-25',
            ]),
        );
        await openEditor(user);
        await pickDay(user, '10 January 2026');
        expect(editor()).toBeInTheDocument();
        expect(draft.current?.values).toStrictEqual([
            '2026-01-10',
            '2026-01-25',
        ]);
        // The start calendar closes on pick; let it go before the end one opens
        await waitFor(() =>
            expect(document.querySelector('[data-dates-dropdown]')).toBeNull(),
        );
        await pickDay(user, '28 January 2026', 1);
        expect(editor()).toBeInTheDocument();
        expect(draft.current?.values).toStrictEqual([
            '2026-01-10',
            '2026-01-28',
        ]);
    });

    it('a timestamp field, "is between": picking the start day then the end day keeps the popover open with both set', async () => {
        const user = userEvent.setup();
        const { draft } = renderEditor(
            rule('created_at', FilterOperator.IN_BETWEEN, [
                '2026-01-15T00:00:00Z',
                '2026-01-25T00:00:00Z',
            ]),
        );
        await openEditor(user);
        await pickDay(user, '10 January 2026');
        expect(editor()).toBeInTheDocument();
        expect(String(draft.current?.values?.[0])).toMatch(/^2026-01-10/);
        expect(String(draft.current?.values?.[1])).toMatch(/^2026-01-25/);
        // A timestamp calendar stays open for the time: Escape closes only it
        await user.keyboard('{Escape}');
        await waitFor(() =>
            expect(document.querySelector('[data-dates-dropdown]')).toBeNull(),
        );
        expect(editor()).toBeInTheDocument();
        await pickDay(user, '28 January 2026', 1);
        expect(editor()).toBeInTheDocument();
        expect(String(draft.current?.values?.[0])).toMatch(/^2026-01-10/);
        expect(String(draft.current?.values?.[1])).toMatch(/^2026-01-28/);
    });

    it('an operator picked from the menu, then a day: the popover stays open', async () => {
        const user = userEvent.setup();
        const { draft } = renderEditor(
            rule('order_date', FilterOperator.LESS_THAN, ['2026-01-15']),
        );
        await openEditor(user);
        await user.click(
            within(editor()).getByRole('button', {
                name: /^Operator:/,
                hidden: true,
            }),
        );
        await user.click(
            await screen.findByRole('menuitem', {
                name: /is after/,
                hidden: true,
            }),
        );
        await waitFor(() =>
            expect(
                screen.queryByRole('menu', { hidden: true }),
            ).not.toBeInTheDocument(),
        );
        expect(editor()).toBeInTheDocument();
        await pickDay(user, '20 January 2026');
        expect(editor()).toBeInTheDocument();
        expect(draft.current?.operator).toBe(FilterOperator.GREATER_THAN);
        expect(draft.current?.values).toStrictEqual(['2026-01-20']);
    });

    it('"Allow multiple values" in the portalled operator menu keeps the popover open', async () => {
        const user = userEvent.setup();
        const { draft } = renderEditor(
            rule('status', FilterOperator.EQUALS, ['done']),
        );
        await openEditor(user);
        await user.click(
            within(editor()).getByRole('button', {
                name: /^Operator:/,
                hidden: true,
            }),
        );
        await user.click(
            await screen.findByRole('menuitemcheckbox', {
                name: /Allow multiple values/,
                hidden: true,
            }),
        );
        expect(editor()).toBeInTheDocument();
        expect(draft.current?.singleValue).toBe(true);
    });

    it('still closes on a press outside the popover and its calendar', async () => {
        const user = userEvent.setup();
        renderEditor(
            rule('order_date', FilterOperator.LESS_THAN, ['2026-01-15']),
        );
        await openEditor(user);
        // The value input opens its calendar: the first press closes only that
        expect(document.querySelector('[data-dates-dropdown]')).not.toBeNull();
        await user.click(screen.getByRole('button', { name: 'Outside' }));
        await waitFor(() =>
            expect(document.querySelector('[data-dates-dropdown]')).toBeNull(),
        );
        expect(
            screen.getByRole('dialog', { hidden: true }),
        ).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Outside' }));
        expect(
            screen.queryByRole('dialog', { hidden: true }),
        ).not.toBeInTheDocument();
    });
});
