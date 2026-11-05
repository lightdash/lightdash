import {
    DEFAULT_UI_STRINGS,
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    type DashboardControlSection,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTab,
} from '@lightdash/common';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import editorClasses from './FilterEditor.module.css';
import { FilterPopover, type EditorView } from './FilterPopover';

// Stands in for the shipped value input: a text box, and one way each to
// empty and to fill it. A list value input (`include`) opens on focus
const mockListOpens = vi.hoisted(() => vi.fn());
vi.mock('../../components/common/Filters/FilterInputs', () => ({
    default: ({
        rule,
        onChange,
        popoverProps,
    }: {
        rule: DashboardFilterRule;
        onChange: (next: DashboardFilterRule) => void;
        popoverProps?: {
            closeListOnPick?: boolean;
            openListOnFocus?: boolean;
        };
    }) => (
        <div
            data-testid="value-input"
            data-disabled={String(!!rule.disabled)}
            data-close-list-on-pick={String(!!popoverProps?.closeListOnPick)}
            data-open-list-on-focus={String(popoverProps?.openListOnFocus)}
        >
            <input
                aria-label="Value"
                aria-haspopup={
                    rule.operator === FilterOperator.INCLUDE
                        ? 'listbox'
                        : undefined
                }
                onFocus={() => mockListOpens()}
            />
            <button
                type="button"
                onClick={() => onChange({ ...rule, values: [] })}
            >
                Empty the input
            </button>
            <button
                type="button"
                onClick={() => onChange({ ...rule, values: ['shipped'] })}
            >
                Fill the input
            </button>
        </div>
    ),
}));

// Required and Lock have their own tests (`ViewerControls.test.tsx`)
vi.mock('./ViewerControls', () => ({
    ViewerControls: ({
        onChangeOthers,
        onEditRules,
    }: {
        onChangeOthers: (rules: DashboardFilterRule[]) => void;
        onEditRules: (() => void) | null;
    }) => (
        <div data-testid="viewer-controls">
            <button
                type="button"
                onClick={() =>
                    onChangeOthers([{ id: 'filter-2' } as DashboardFilterRule])
                }
            >
                change others
            </button>
            {onEditRules !== null && (
                <button type="button" onClick={onEditRules}>
                    edit rules
                </button>
            )}
        </div>
    ),
}));

// An embed's overrides, by key; none outside the tests that set them
const mockUiOverrides = vi.hoisted(() => ({
    current: {} as Record<string, string>,
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ t: (key: string) => mockUiOverrides.current[key] }),
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) =>
        selector({
            allFilterableFieldsMap: {},
            allFilterableMetricsMap: {},
            filterableFieldsByTileUuid: {},
        }),
    ),
}));

const LOCKED_REQUIRED =
    DEFAULT_UI_STRINGS['filters.config.applyLockedRequiredTooltip'];

const status: DashboardFilterableField = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
    description: 'Where the order is in fulfilment.',
};

// No label key, as a rule saved without one
const makeRule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule =>
    ({
        id: 'filter-1',
        operator: FilterOperator.EQUALS,
        target: { fieldId: 'orders_status', tableName: 'orders' },
        values: ['done'],
        ...overrides,
    }) as DashboardFilterRule;

const noFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

type HarnessProps = Partial<{
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    filterType: FilterType;
    isViewer: boolean;
    canChooseTiles: boolean;
    isCreatingNew: boolean;
    canManageExplore: boolean;
    savedRule: DashboardFilterRule | null;
    appliedTileCount: number;
    filters: DashboardFilters;
    isAsking: boolean;
    initialView: EditorView;
    onEditRules: (() => void) | null;
}>;

const callbacks = {
    onChange: vi.fn(),
    onChangeOthers: vi.fn(),
    onCancel: vi.fn(),
    onApply: vi.fn(),
    onChooseTiles: vi.fn(),
    onResolvePending: vi.fn(),
};

// Holds the rule as the provider's draft does
const Harness: FC<HarnessProps> = ({
    rule: initialRule = makeRule(),
    filters,
    ...props
}) => {
    const [rule, setRule] = useState(initialRule);
    return (
        <FilterPopover
            field={status}
            filterType={FilterType.STRING}
            isViewer={false}
            canChooseTiles
            isCreatingNew={false}
            canManageExplore={false}
            savedRule={null}
            appliedTileCount={6}
            totalTileCount={6}
            isAsking={false}
            initialView="value"
            onEditRules={null}
            {...callbacks}
            {...props}
            rule={rule}
            filters={filters ?? { ...noFilters, dimensions: [rule] }}
            onChange={(next) => {
                callbacks.onChange(next);
                setRule(next);
            }}
        />
    );
};

const renderPopover = (
    props: HarnessProps = {},
    {
        sections = [],
        tabs = [],
        canManageExplore = false,
    }: {
        sections?: DashboardControlSection[];
        tabs?: DashboardTab[];
        canManageExplore?: boolean;
    } = {},
) => {
    const store = seedDashboardEditState(createDashboardTestStore(), {
        dashboard: {
            config: { isDateZoomDisabled: false, controlSections: sections },
        },
        dashboardTabs: tabs,
    });
    return renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <Harness {...props} />
        </DashboardStoreTestProvider>,
        canManageExplore
            ? {
                  user: {
                      abilityRules: [{ action: 'manage', subject: 'Explore' }],
                  },
              }
            : undefined,
    );
};

const lastChange = (): DashboardFilterRule =>
    callbacks.onChange.mock.lastCall?.[0];

const operatorButton = () => screen.getByRole('button', { name: /^Operator:/ });

const openOperatorMenu = async () => {
    await userEvent.click(operatorButton());
    return screen.findByRole('menu');
};

describe('FilterPopover', () => {
    beforeEach(() => {
        Object.values(callbacks).forEach((callback) => callback.mockClear());
        mockListOpens.mockClear();
        mockUiOverrides.current = {};
    });

    describe('header', () => {
        it("shows the field's icon, the name and the operator in the header", () => {
            renderPopover();
            const dialog = screen.getByRole('dialog', { name: 'Status' });
            expect(within(dialog).getByText('Status')).toBeInTheDocument();
            expect(operatorButton()).toHaveAccessibleName('Operator: is');
        });

        it('names the operator menu through the registry, as an embed overrides it', () => {
            mockUiOverrides.current = {
                'controls.operatorLabel': 'Operador: {operator}',
            };
            renderPopover({
                rule: makeRule({ operator: FilterOperator.NOT_EQUALS }),
            });
            expect(
                screen.getByRole('button', { name: /^Operador:/ }),
            ).toHaveAccessibleName('Operador: is not');
        });

        it.each([
            [
                'a text value',
                FilterType.STRING,
                makeRule({ values: ['a', 'b'] }),
            ],
            [
                'a relative date',
                FilterType.DATE,
                makeRule({
                    operator: FilterOperator.IN_THE_PAST,
                    values: [3],
                    settings: { unitOfTime: 'months', completed: true },
                }),
            ],
            [
                'a locked, required filter',
                FilterType.STRING,
                makeRule({ required: true, lockedTabUuids: ['tab-1'] }),
            ],
        ])(
            'keeps %s when the operator already picked is picked again',
            async (_name, filterType, rule) => {
                renderPopover({ filterType, field: null, rule });
                const before = operatorButton().getAttribute('aria-label');
                const menu = await openOperatorMenu();
                await userEvent.click(
                    within(menu).getByRole('menuitem', {
                        name: before!.replace(/^Operator: /, ''),
                    }),
                );
                expect(callbacks.onChange).not.toHaveBeenCalled();
                expect(operatorButton()).toHaveAccessibleName(before!);
                expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            },
        );

        it("shows the field's description after the name, only when it has one", () => {
            const { unmount } = renderPopover();
            expect(
                screen.getByRole('button', {
                    name: 'Where the order is in fulfilment.',
                }),
            ).toBeInTheDocument();
            unmount();
            renderPopover({ field: { ...status, description: '  ' } });
            expect(
                screen.queryByRole('button', {
                    name: 'Where the order is in fulfilment.',
                }),
            ).not.toBeInTheDocument();
        });

        it("lists the operators of the filter's type in the operator menu", async () => {
            renderPopover();
            const menu = await openOperatorMenu();
            for (const name of [/^starts with$/, /^includes$/, /^is null$/])
                expect(
                    within(menu).getByRole('menuitem', { name }),
                ).toBeInTheDocument();
        });

        it('picks an operator from the menu and Apply hands it on', async () => {
            renderPopover();
            const menu = await openOperatorMenu();
            await userEvent.click(
                within(menu).getByRole('menuitem', { name: /^starts with$/ }),
            );
            expect(lastChange()).toEqual(
                expect.objectContaining({
                    operator: FilterOperator.STARTS_WITH,
                }),
            );
            expect(operatorButton()).toHaveAccessibleName(
                'Operator: starts with',
            );
            fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
            expect(callbacks.onApply).toHaveBeenCalled();
        });

        it('refuses an operator that would empty a locked, required filter', async () => {
            renderPopover({
                rule: makeRule({ required: true, lockedTabUuids: ['tab-1'] }),
            });
            const menu = await openOperatorMenu();
            await userEvent.click(
                within(menu).getByRole('menuitem', { name: /^starts with$/ }),
            );
            expect(callbacks.onChange).not.toHaveBeenCalled();
            expect(operatorButton()).toHaveAccessibleName('Operator: is');
            expect(await screen.findByRole('alert')).toHaveTextContent(
                LOCKED_REQUIRED,
            );
        });

        it.each([
            ['is null', FilterOperator.NULL],
            ['is not null', FilterOperator.NOT_NULL],
        ])(
            'says why it refuses "is" from %s on a locked, required filter',
            async (_name, operator) => {
                renderPopover({
                    rule: makeRule({
                        operator,
                        values: [],
                        required: true,
                        lockedTabUuids: ['tab-1'],
                    }),
                });
                const menu = await openOperatorMenu();
                await userEvent.click(
                    within(menu).getByRole('menuitem', { name: /^is$/ }),
                );
                expect(callbacks.onChange).not.toHaveBeenCalled();
                expect(await screen.findByRole('alert')).toHaveTextContent(
                    LOCKED_REQUIRED,
                );
            },
        );

        it('focuses the operator, not the description, when no value input can take focus', () => {
            renderPopover({
                rule: makeRule({ operator: FilterOperator.NULL }),
            });
            expect(operatorButton()).toHaveFocus();
        });

        it('pops the operator menu as the other editor menus, reduced motion included', async () => {
            renderPopover();
            expect(await openOperatorMenu()).toHaveClass(editorClasses.menu);
        });

        it('applies is null enabled, with no value input', async () => {
            renderPopover({ rule: makeRule({ values: [], disabled: true }) });
            const menu = await openOperatorMenu();
            await userEvent.click(
                within(menu).getByRole('menuitem', { name: /^is null$/ }),
            );
            expect(lastChange()).toEqual(
                expect.objectContaining({
                    operator: FilterOperator.NULL,
                    disabled: false,
                }),
            );
            expect(screen.queryByTestId('value-input')).not.toBeInTheDocument();
        });
    });

    describe('Allow multiple values', () => {
        const checkbox = () =>
            screen.queryByRole('menuitemcheckbox', {
                name: /^Allow multiple values/,
            });

        it('is checked for a rule with no setting, and says viewers can pick several', async () => {
            renderPopover();
            await openOperatorMenu();
            expect(checkbox()).toHaveAttribute('aria-checked', 'true');
            // Named by its title alone, so the description is read once
            expect(checkbox()).toHaveAccessibleName('Allow multiple values');
            expect(checkbox()).toHaveAccessibleDescription(
                'Viewers can pick multiple values',
            );
        });

        it('is reached with the arrow keys after the last operator', async () => {
            renderPopover();
            const menu = await openOperatorMenu();
            const items = within(menu).getAllByRole('menuitem');
            items.at(-1)?.focus();
            await userEvent.keyboard('{ArrowDown}');
            expect(checkbox()).toHaveFocus();
            await userEvent.keyboard('{Enter}');
            expect(lastChange()).toEqual(
                expect.objectContaining({ singleValue: true }),
            );
            expect(screen.getByRole('menu')).toBeInTheDocument();
        });

        it('toggles singleValue, keeping the menu open and the operator', async () => {
            renderPopover({ rule: makeRule({ singleValue: true }) });
            await openOperatorMenu();
            expect(checkbox()).toHaveAttribute('aria-checked', 'false');
            expect(checkbox()).toHaveAccessibleDescription(
                'Viewers pick one value',
            );
            await userEvent.click(checkbox()!);
            expect(lastChange()).toEqual(
                expect.objectContaining({
                    singleValue: false,
                    operator: FilterOperator.EQUALS,
                    values: ['done'],
                }),
            );
            expect(screen.getByRole('menu')).toBeInTheDocument();
            expect(checkbox()).toHaveAttribute('aria-checked', 'true');
        });

        it.each([
            [
                'a number compared against one value',
                FilterType.NUMBER,
                FilterOperator.GREATER_THAN,
            ],
            ['a date', FilterType.DATE, FilterOperator.EQUALS],
            ['a yes/no', FilterType.BOOLEAN, FilterOperator.EQUALS],
        ])('is not offered for %s', async (_name, filterType, operator) => {
            renderPopover({
                filterType,
                field: null,
                rule: makeRule({ operator }),
            });
            await openOperatorMenu();
            expect(checkbox()).toBeNull();
        });

        it('is not offered to a viewer', async () => {
            renderPopover({ isViewer: true, canChooseTiles: false });
            await openOperatorMenu();
            expect(checkbox()).toBeNull();
        });
    });

    describe('name', () => {
        it('renames with Enter, committing the label and naming the dialog', async () => {
            renderPopover();
            fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
            const input = screen.getByRole('textbox', { name: 'Name' });
            expect(input).toHaveFocus();
            // Its Escape reverts the name and never cancels the editor
            expect(input).toHaveAttribute('data-own-escape');
            await userEvent.type(input, 'Order status{Enter}');
            expect(lastChange()).toEqual(
                expect.objectContaining({ label: 'Order status' }),
            );
            expect(
                screen.getByRole('dialog', { name: 'Order status' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Rename' }),
            ).toHaveFocus();
        });

        it('rename, then Cancel hands the cancel on', async () => {
            renderPopover();
            fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
            await userEvent.type(
                screen.getByRole('textbox', { name: 'Name' }),
                'Order status{Enter}',
            );
            fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(callbacks.onCancel).toHaveBeenCalled();
        });

        it('reverts on Escape to the label it had', async () => {
            renderPopover({ rule: makeRule({ label: 'Order status' }) });
            fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
            await userEvent.type(
                screen.getByRole('textbox', { name: 'Name' }),
                'x{Escape}',
            );
            expect(lastChange()).toEqual(
                expect.objectContaining({ label: 'Order status' }),
            );
            expect(
                screen.getByRole('dialog', { name: 'Order status' }),
            ).toBeInTheDocument();
        });

        it('writes an emptied label as no label, back to the field name', async () => {
            renderPopover();
            fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
            await userEvent.type(
                screen.getByRole('textbox', { name: 'Name' }),
                '   {Enter}',
            );
            expect('label' in lastChange()).toBe(false);
            expect(
                screen.getByRole('dialog', { name: 'Status' }),
            ).toBeInTheDocument();
        });

        it('has no pencil for a viewer', () => {
            renderPopover({ isViewer: true, canChooseTiles: false });
            expect(
                screen.queryByRole('button', { name: 'Rename' }),
            ).not.toBeInTheDocument();
        });

        it('names a SQL column filter by its column', () => {
            renderPopover({
                field: null,
                rule: makeRule({
                    target: {
                        fieldId: 'ordered_at',
                        tableName: 'sql_chart',
                        isSqlColumn: true,
                    },
                }),
            });
            expect(
                screen.getByRole('dialog', { name: 'ordered_at' }),
            ).toBeInTheDocument();
        });
    });

    describe('value', () => {
        it('focuses a text value on open, its list shut', () => {
            renderPopover({
                rule: makeRule({ operator: FilterOperator.INCLUDE }),
            });
            expect(screen.getByLabelText('Value')).toHaveFocus();
            expect(screen.getByTestId('value-input')).toHaveAttribute(
                'data-open-list-on-focus',
                'false',
            );
        });

        it('never focuses another value input that opens its list on focus', () => {
            renderPopover({
                filterType: FilterType.NUMBER,
                field: null,
                rule: makeRule({ operator: FilterOperator.INCLUDE }),
            });
            expect(screen.getByLabelText('Value')).not.toHaveFocus();
            expect(mockListOpens).not.toHaveBeenCalled();
        });

        it('closes a text list on pick and keeps the list props off other inputs', () => {
            const { unmount } = renderPopover();
            expect(screen.getByTestId('value-input')).toHaveAttribute(
                'data-close-list-on-pick',
                'true',
            );
            unmount();
            renderPopover({ filterType: FilterType.DATE, field: null });
            expect(screen.getByTestId('value-input')).toHaveAttribute(
                'data-close-list-on-pick',
                'false',
            );
        });

        it("shows an editor's value input enabled on a rule that is any value", () => {
            renderPopover({ rule: makeRule({ values: [], disabled: true }) });
            expect(screen.getByTestId('value-input')).toHaveAttribute(
                'data-disabled',
                'false',
            );
        });

        it("puts an editor's typed value in effect, and an emptied one back to any value", () => {
            renderPopover({ rule: makeRule({ values: [], disabled: true }) });
            fireEvent.click(
                screen.getByRole('button', { name: 'Fill the input' }),
            );
            expect(lastChange()).toEqual(
                expect.objectContaining({
                    values: ['shipped'],
                    disabled: false,
                }),
            );
            fireEvent.click(
                screen.getByRole('button', { name: 'Empty the input' }),
            );
            expect(lastChange()).toEqual(
                expect.objectContaining({ values: [], disabled: true }),
            );
        });

        it("writes a viewer's edit with the shipped disabled state", () => {
            renderPopover({ isViewer: true, canChooseTiles: false });
            fireEvent.click(
                screen.getByRole('button', { name: 'Empty the input' }),
            );
            expect(lastChange()).toEqual(
                expect.objectContaining({ values: [], disabled: true }),
            );
        });

        it("clears a viewer's value to any value with the shipped X", async () => {
            const { container } = renderPopover(
                {
                    isViewer: true,
                    canChooseTiles: false,
                    canManageExplore: true,
                },
                { canManageExplore: true },
            );
            const clear = container
                .querySelector('.tabler-icon-x')
                ?.closest('button');
            expect(clear).toBeTruthy();
            fireEvent.click(clear!);
            expect(lastChange()).toEqual(
                expect.objectContaining({ values: [] }),
            );
        });

        it("has no clear X for an editor, nor for a viewer's required filter", () => {
            const { container, unmount } = renderPopover({
                canManageExplore: true,
            });
            expect(container.querySelector('.tabler-icon-x')).toBeNull();
            unmount();
            const viewer = renderPopover({
                isViewer: true,
                canChooseTiles: false,
                canManageExplore: true,
                rule: makeRule({ required: true }),
            });
            expect(viewer.container.querySelector('.tabler-icon-x')).toBeNull();
        });

        it.each([
            [true, 1],
            [false, 0],
        ])(
            "labels a viewer's new filter's value (new: %s)",
            (isCreatingNew, count) => {
                renderPopover({ isViewer: true, isCreatingNew });
                expect(
                    screen.queryAllByText(
                        DEFAULT_UI_STRINGS['filters.config.valueLabel'],
                    ),
                ).toHaveLength(count);
            },
        );

        describe('a locked and required filter', () => {
            const lockedRequired = makeRule({
                required: true,
                lockedTabUuids: ['tab-1'],
            });

            it('keeps its value, saying why on every refused edit', () => {
                renderPopover({ rule: lockedRequired });
                expect(screen.getByText(LOCKED_REQUIRED)).toBeInTheDocument();
                expect(screen.queryByRole('alert')).not.toBeInTheDocument();
                const refuse = () => {
                    fireEvent.click(
                        screen.getByRole('button', { name: 'Empty the input' }),
                    );
                    const alert = screen.getByRole('alert');
                    expect(alert).toHaveTextContent(LOCKED_REQUIRED);
                    return alert;
                };
                const first = refuse();
                // A new node each time, so a screen reader announces it again
                expect(refuse()).not.toBe(first);
                expect(callbacks.onChange).not.toHaveBeenCalled();
            });

            it('gives focus back to the input the refused edit came from', async () => {
                renderPopover({ rule: lockedRequired });
                const input = screen.getByLabelText('Value');
                act(() => input.focus());
                fireEvent.click(
                    screen.getByRole('button', { name: 'Empty the input' }),
                );
                await waitFor(() =>
                    expect(screen.getByLabelText('Value')).not.toBe(input),
                );
                expect(screen.getByLabelText('Value')).toHaveFocus();
            });

            it('still takes an edit that leaves it with a value', () => {
                renderPopover({ rule: lockedRequired });
                fireEvent.click(
                    screen.getByRole('button', { name: 'Fill the input' }),
                );
                expect(lastChange()).toEqual(
                    expect.objectContaining({ values: ['shipped'] }),
                );
            });

            it.each([
                ['only required', makeRule({ required: true })],
                ['only locked', makeRule({ lockedTabUuids: ['tab-1'] })],
                [
                    'saved with no value',
                    { ...lockedRequired, values: [], disabled: true },
                ],
            ])('can be emptied when %s', (_name, rule) => {
                renderPopover({ rule });
                fireEvent.click(
                    screen.getByRole('button', { name: 'Empty the input' }),
                );
                expect(callbacks.onChange).toHaveBeenCalled();
            });
        });
    });

    describe('footer', () => {
        it('counts the tiles in the footer chip and enters mapping', () => {
            renderPopover({ appliedTileCount: 2 });
            const chip = screen.getByRole('button', {
                name: 'Applies to 2 of 6 tiles. Choose tiles',
            });
            fireEvent.click(chip);
            expect(callbacks.onChooseTiles).toHaveBeenCalled();
        });

        it('says every tile without a fraction', () => {
            renderPopover();
            expect(
                screen.getByRole('button', {
                    name: 'Applies to 6 tiles. Choose tiles',
                }),
            ).toBeInTheDocument();
        });

        it('blocks Apply at no tiles', () => {
            renderPopover({ appliedTileCount: 0 });
            expect(
                screen.getByRole('button', { name: 'Apply' }),
            ).toBeDisabled();
        });

        it("blocks a viewer's Apply on a required group until another member has a value", () => {
            const rule = makeRule({ values: [], requiredGroupId: 'group-1' });
            const other = makeRule({
                id: 'filter-2',
                requiredGroupId: 'group-1',
            });
            const { unmount } = renderPopover({
                isViewer: true,
                canChooseTiles: false,
                rule,
                filters: { ...noFilters, dimensions: [rule] },
            });
            expect(
                screen.getByRole('button', { name: 'Apply' }),
            ).toBeDisabled();
            unmount();
            renderPopover({
                isViewer: true,
                canChooseTiles: false,
                rule,
                filters: { ...noFilters, dimensions: [rule, other] },
            });
            expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
        });

        it("never blocks a viewer's Apply on tiles", () => {
            renderPopover({
                isViewer: true,
                appliedTileCount: 0,
                rule: makeRule({ required: true }),
            });
            expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
        });

        it("blocks a viewer's Apply on a required filter they cleared", () => {
            renderPopover({
                isViewer: true,
                rule: makeRule({ values: [], required: true }),
            });
            expect(
                screen.getByRole('button', { name: 'Apply' }),
            ).toBeDisabled();
        });

        it('lets a viewer apply a required filter saved with no value, untouched, and blocks it once they clear a value', () => {
            const { unmount } = renderPopover({
                isViewer: true,
                canChooseTiles: false,
                rule: makeRule({ values: [], required: true, disabled: true }),
            });
            expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
            unmount();

            renderPopover({
                isViewer: true,
                canChooseTiles: false,
                rule: makeRule({ required: true, disabled: false }),
            });
            expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
            fireEvent.click(
                screen.getByRole('button', { name: 'Empty the input' }),
            );
            expect(
                screen.getByRole('button', { name: 'Apply' }),
            ).toBeDisabled();
        });

        it('lets a viewer apply a member of a required group saved with no value, untouched or cleared', () => {
            const rule = makeRule({ requiredGroupId: 'group-1' });
            renderPopover({
                isViewer: true,
                canChooseTiles: false,
                rule: { ...rule, values: [], disabled: true },
            });
            expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
            fireEvent.click(
                screen.getByRole('button', { name: 'Fill the input' }),
            );
            fireEvent.click(
                screen.getByRole('button', { name: 'Empty the input' }),
            );
            // Written off, as any value, as the shipped popover does
            expect(lastChange()).toEqual(
                expect.objectContaining({ values: [], disabled: true }),
            );
            expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
        });

        it('lets an editor apply a required filter with no value', () => {
            renderPopover({
                rule: makeRule({ values: [], required: true, disabled: true }),
            });
            expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
        });

        it("gives a viewer's own filter Choose tiles and no Settings", () => {
            renderPopover({ isViewer: true, canChooseTiles: true });
            expect(
                screen.getByRole('button', { name: /Choose tiles$/ }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: /^Settings/ }),
            ).not.toBeInTheDocument();
        });

        it("gives a viewer's saved filter the value alone", () => {
            renderPopover({ isViewer: true, canChooseTiles: false });
            for (const name of [/Choose tiles/, /^Settings/, /^Rename$/])
                expect(
                    screen.queryByRole('button', { name }),
                ).not.toBeInTheDocument();
        });

        it('summarises section, required and lock on the Settings chip', () => {
            renderPopover(
                {
                    rule: makeRule({
                        sectionId: 'section-a',
                        required: true,
                        lockedTabUuids: ['tab-1'],
                    }),
                },
                {
                    sections: [{ id: 'section-a', name: 'Dates' }],
                    tabs: [
                        { uuid: 'tab-1', name: 'Overview', order: 0 },
                        { uuid: 'tab-2', name: 'Detail', order: 1 },
                    ] as DashboardTab[],
                },
            );
            expect(
                screen.getByRole('button', {
                    name: 'Settings: Dates · Required · Locked on Overview',
                }),
            ).toBeInTheDocument();
        });

        it('names the alternatives of a required group in the summary', () => {
            const rule = makeRule({ requiredGroupId: 'group-1' });
            renderPopover({
                rule,
                filters: {
                    ...noFilters,
                    dimensions: [
                        rule,
                        makeRule({
                            id: 'filter-2',
                            label: 'Open orders',
                            requiredGroupId: 'group-1',
                        }),
                    ],
                },
            });
            expect(
                screen.getByRole('button', {
                    name: 'Settings: Required, or Open orders',
                }),
            ).toBeInTheDocument();
        });

        describe("a viewer's reset", () => {
            const reset = () =>
                screen.queryByRole('button', {
                    name: DEFAULT_UI_STRINGS[
                        'filters.config.resetToOriginalAria'
                    ],
                });

            it('is not offered on an unchanged saved filter, written out as the draft is', () => {
                const saved = makeRule();
                renderPopover({
                    isViewer: true,
                    canChooseTiles: false,
                    savedRule: saved,
                    rule: { ...saved, disabled: false },
                });
                expect(reset()).toBeNull();
            });

            it('puts back the saved value once it changed, as a draft edit', () => {
                const saved = makeRule();
                renderPopover({
                    isViewer: true,
                    canChooseTiles: false,
                    savedRule: saved,
                    rule: { ...saved, disabled: false },
                });
                fireEvent.click(
                    screen.getByRole('button', { name: 'Fill the input' }),
                );
                expect(reset()).not.toBeNull();
                fireEvent.click(reset()!);
                expect(lastChange()).toEqual(
                    expect.objectContaining({ values: ['done'] }),
                );
                expect(reset()).toBeNull();
                expect(callbacks.onApply).not.toHaveBeenCalled();
            });

            it('is not offered to an editor', () => {
                renderPopover({
                    savedRule: makeRule(),
                    rule: makeRule({ values: ['other'] }),
                });
                expect(reset()).toBeNull();
            });
        });
    });

    describe('Settings', () => {
        it('opens in place, focuses Back, and Back gives focus to the Settings chip', () => {
            renderPopover();
            fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
            expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
            expect(screen.getByTestId('viewer-controls')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Back' }));
            expect(
                screen.getByRole('button', { name: 'Settings' }),
            ).toHaveFocus();
        });

        it('has no Move left or Move right', () => {
            renderPopover({ initialView: 'settings' });
            for (const name of ['Move left', 'Move right'])
                expect(
                    screen.queryByRole('button', { name }),
                ).not.toBeInTheDocument();
        });

        it('picks the section: each section in order, or none', async () => {
            renderPopover(
                {
                    initialView: 'settings',
                    rule: makeRule({ sectionId: 'section-b' }),
                },
                {
                    sections: [
                        { id: 'section-a', name: 'Dates' },
                        { id: 'section-b', name: 'Regions' },
                    ],
                },
            );
            const select = screen.getByRole('combobox', { name: 'Section' });
            expect(select).toHaveValue('Regions');
            await userEvent.click(select);
            expect(
                screen
                    .getAllByRole('option')
                    .map((option) => option.textContent),
            ).toEqual(['No section', 'Dates', 'Regions']);
            await userEvent.click(
                screen.getByRole('option', { name: 'Dates' }),
            );
            expect(lastChange()).toEqual(
                expect.objectContaining({ sectionId: 'section-a' }),
            );
            await userEvent.click(select);
            await userEvent.click(
                screen.getByRole('option', { name: 'No section' }),
            );
            expect('sectionId' in lastChange()).toBe(false);
        });

        it('offers no section without sections', () => {
            renderPopover({ initialView: 'settings' });
            expect(
                screen.queryByRole('combobox', { name: 'Section' }),
            ).not.toBeInTheDocument();
        });

        it('hands the other rules and the filter rules link to Required', () => {
            const onEditRules = vi.fn();
            renderPopover({ initialView: 'settings', onEditRules });
            fireEvent.click(
                screen.getByRole('button', { name: 'change others' }),
            );
            expect(callbacks.onChangeOthers).toHaveBeenCalledWith([
                { id: 'filter-2' },
            ]);
            fireEvent.click(screen.getByRole('button', { name: 'edit rules' }));
            expect(onEditRules).toHaveBeenCalled();
        });
    });

    describe('with changes unapplied elsewhere', () => {
        it('asks at the top: Discard or Apply, the rest inert', () => {
            renderPopover({ isAsking: true });
            expect(screen.getByRole('status')).toHaveTextContent(
                'Apply changes to Status first?',
            );
            const buttons = screen.getAllByRole('button', { name: 'Apply' });
            expect(buttons[0]).toHaveFocus();
            fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
            expect(callbacks.onResolvePending).toHaveBeenCalledWith(false);
            fireEvent.click(buttons[0]);
            expect(callbacks.onResolvePending).toHaveBeenCalledWith(true);
            expect(
                screen.getByTestId('value-input').closest('[inert]'),
            ).not.toBeNull();
        });
    });
});
