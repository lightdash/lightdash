import {
    createDashboardFilterRuleFromField,
    DimensionType,
    FilterOperator,
    FilterType,
    getFilterTypeFromItem,
    getFilterTypeFromItemType,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import { Box, Group } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type FC } from 'react';
import { fn } from 'storybook/test';
import { getFilterRuleWithOperator } from '../../features/dashboardFilters/FilterConfiguration/utils';
import { AddControlMenu } from './AddControlMenu';
import { createTypeControlRule, type ControlType } from './controlTypes';
import {
    FilterPopoverSentence,
    type FooterLayout,
    type PopoverView,
} from './FilterPopoverSentence';
import {
    fields,
    getMappedTileTargets,
    MAPPED_TILE_COUNT,
    rules,
    tabs,
    TOTAL_TILE_COUNT,
} from './fixtures';
import { FilterPopoverStoryProviders } from './StoryProviders';

type StoryProps = {
    initialRule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    /** A control started from a type; null for a field's filter. */
    controlType: ControlType | null;
    /** The field "Choose tiles" maps a new control to; null maps nothing. */
    mapsTo: FilterableDimension | null;
    isViewer: boolean;
    isOwnFilter: boolean;
    isCreatingNew: boolean;
    canManageExplore: boolean;
    appliedTileCount: number;
    isAsking: boolean;
    initialView: PopoverView;
    footerLayout: FooterLayout;
    onApply: (rule: DashboardFilterRule) => void;
    onCancel: () => void;
    onChooseTiles: () => void;
    onEditRules: () => void;
    onChangeOthers: (rules: DashboardFilterRule[]) => void;
};

// Holds the draft: Cancel puts the rule back as it opened, Apply hands it on
const StatefulPopover: FC<StoryProps> = ({
    initialRule,
    field,
    mapsTo,
    appliedTileCount,
    isAsking: initialIsAsking,
    onApply,
    onCancel,
    onChooseTiles,
    ...props
}) => {
    const [rule, setRule] = useState(initialRule);
    const [isAsking, setIsAsking] = useState(initialIsAsking);
    // Stands in for mapping: the control's first mapped field
    const [mappedField, setMappedField] = useState<FilterableDimension | null>(
        null,
    );
    // A cancel remounts, as reopening the filter would
    const [opening, setOpening] = useState(0);
    const reset = () => {
        setRule(initialRule);
        setMappedField(null);
        setOpening((count) => count + 1);
    };
    const shownField = field ?? mappedField;
    const { fallbackType } = rule.target;
    return (
        <FilterPopoverSentence
            key={opening}
            {...props}
            rule={rule}
            field={shownField}
            filterType={
                shownField
                    ? getFilterTypeFromItem(shownField)
                    : fallbackType
                      ? getFilterTypeFromItemType(fallbackType)
                      : FilterType.STRING
            }
            appliedTileCount={
                mappedField === null ? appliedTileCount : MAPPED_TILE_COUNT
            }
            totalTileCount={TOTAL_TILE_COUNT}
            isAsking={isAsking}
            onChange={setRule}
            onChooseTiles={() => {
                onChooseTiles();
                if (mapsTo === null || shownField !== null) return;
                setMappedField(mapsTo);
                setRule((current) => ({
                    ...current,
                    tileTargets: getMappedTileTargets(mapsTo),
                }));
            }}
            onCancel={() => {
                reset();
                onCancel();
            }}
            onApply={() => onApply(rule)}
            onResolvePending={(shouldApply) => {
                if (shouldApply) onApply(rule);
                else reset();
                setIsAsking(false);
            }}
        />
    );
};

const meta: Meta<typeof StatefulPopover> = {
    title: 'Prototypes/Filter popover sentence',
    component: StatefulPopover,
    parameters: { layout: 'fullscreen' },
    decorators: [
        (Story) => (
            <FilterPopoverStoryProviders>
                <Box p="xl">
                    <Story />
                </Box>
            </FilterPopoverStoryProviders>
        ),
    ],
    argTypes: {
        footerLayout: { control: 'inline-radio', options: ['inline', 'row'] },
    },
    args: {
        controlType: null,
        mapsTo: null,
        isViewer: false,
        isOwnFilter: false,
        isCreatingNew: false,
        canManageExplore: true,
        appliedTileCount: TOTAL_TILE_COUNT,
        isAsking: false,
        initialView: 'value',
        footerLayout: 'row',
        onApply: fn(),
        onCancel: fn(),
        onChooseTiles: fn(),
        onEditRules: fn(),
        onChangeOthers: fn(),
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Multiple values with autocomplete: suggestions, paste detection, "Edit filter values". */
export const StringIs: Story = {
    args: { initialRule: rules.firstName, field: fields.firstName },
};

/** The operator menu, with the "Multiple values" switch under its options. */
export const StringOperatorMenu: Story = {
    args: StringIs.args,
    play: async ({ canvas, userEvent }) => {
        await userEvent.click(
            canvas.getByRole('button', { name: /^Operator:/ }),
        );
    },
};

/** Suggestions that fail to load: the picker's error and retry. */
export const StringSuggestionsError: Story = {
    args: {
        initialRule: rules.city,
        field: fields.city,
        appliedTileCount: 12,
    },
};

export const NumberIsBetween: Story = {
    args: { initialRule: rules.amountBetween, field: fields.amount },
};

/** Over 500 values: the summary, and "Edit filter values" with Import CSV. */
export const NumberMultipleValues: Story = {
    args: { initialRule: rules.amountMany, field: fields.amount },
};

export const DateInThePastCompleted: Story = {
    args: { initialRule: rules.orderDatePast, field: fields.orderDate },
};

/** A timestamp range: the pickers stack, as they are wider than the popover. */
export const DateIsBetween: Story = {
    args: { initialRule: rules.createdBetween, field: fields.createdAt },
};

/** A date range: the two inputs side by side. */
export const DateIsBetweenDays: Story = {
    args: { initialRule: rules.orderDateBetween, field: fields.orderDate },
};

export const BooleanIs: Story = {
    args: { initialRule: rules.isCompleted, field: fields.isCompleted },
};

/** No value to set: the header and footer only. */
export const IsNull: Story = {
    args: { initialRule: rules.cityIsNull, field: fields.city },
};

export const SqlColumn: Story = {
    args: { initialRule: rules.sqlRegion, field: null, appliedTileCount: 3 },
};

/** Section, then the shipped Required and Lock. */
export const SettingsView: Story = {
    args: {
        initialRule: rules.statusSettings,
        field: fields.status,
        initialView: 'settings',
    },
};

/** Locked and required with no value: Apply is blocked and says why. */
export const RequiredAndLocked: Story = {
    args: {
        initialRule: rules.statusRequiredLocked,
        field: fields.status,
    },
};

/** Clearing the last value of a locked, required filter is refused. */
export const RequiredAndLockedRefusal: Story = {
    args: {
        initialRule: {
            ...rules.statusRequiredLocked,
            values: ['completed'],
            disabled: false,
        },
        field: fields.status,
    },
    // By keyboard: Backspace on the last value is refused, and focus comes
    // back to the input
    play: async ({ canvasElement, userEvent }) => {
        const input = canvasElement.querySelector<HTMLInputElement>(
            '[role="dialog"] input',
        );
        if (input === null) return;
        input.focus();
        await userEvent.keyboard('{Backspace}');
    },
};

/** Another pill was clicked with changes pending. */
export const DirtyPrompt: Story = {
    args: {
        initialRule: { ...rules.firstName, values: ['Aaron', 'Bella', 'Amy'] },
        field: fields.firstName,
        isAsking: true,
    },
};

/** A viewer's own filter: tiles, the note and the clear X. */
export const ViewerOwnFilter: Story = {
    args: {
        initialRule: rules.firstName,
        field: fields.firstName,
        isViewer: true,
        isOwnFilter: true,
        appliedTileCount: 12,
    },
};

/** A viewer on a saved filter: no tiles chip, no settings. */
export const ViewerSavedFilter: Story = {
    args: {
        initialRule: rules.statusSaved,
        field: fields.status,
        isViewer: true,
    },
};

/** A viewer's new filter: the shipped "Value" label above the value. */
export const ViewerNewFilter: Story = {
    args: {
        initialRule: { ...rules.firstName, values: [], disabled: true },
        field: fields.firstName,
        isViewer: true,
        isOwnFilter: true,
        isCreatingNew: true,
    },
};

// A quiet filter beside a busy one, to compare a footer layout
const renderFooterComparison = (footerLayout: FooterLayout) =>
    function FooterComparison(args: StoryProps) {
        return (
            <Group align="flex-start" gap="xl">
                <StatefulPopover {...args} footerLayout={footerLayout} />
                <StatefulPopover
                    {...args}
                    footerLayout={footerLayout}
                    initialRule={rules.statusBusy}
                    field={fields.status}
                    appliedTileCount={12}
                />
            </Group>
        );
    };

/** Chips on the actions row: quiet, and busy (12 of 29 tiles, every setting on). */
export const FooterInline: Story = {
    args: { initialRule: rules.firstName, field: fields.firstName },
    render: renderFooterComparison('inline'),
};

/** Chips on a quiet row of their own: quiet, and busy. */
export const FooterRow: Story = {
    args: { initialRule: rules.firstName, field: fields.firstName },
    render: renderFooterComparison('row'),
};

/** A new filter starts at the shipped field search, alone: no footer. */
export const NewFilterFieldSearch: Story = {
    args: { initialRule: rules.firstName, field: fields.firstName },
    render: () => (
        <AddControlMenu
            fields={Object.values(fields)}
            tabs={tabs}
            withTypes={false}
            onPickField={fn()}
            onPickType={fn()}
        />
    ),
};

// "Choose tiles" in the stories maps each type to a field of that type
const MAPS_TO: Record<ControlType, FilterableDimension> = {
    [DimensionType.STRING]: fields.region,
    [DimensionType.NUMBER]: fields.amount,
    [DimensionType.DATE]: fields.orderDate,
    [DimensionType.BOOLEAN]: fields.isCompleted,
};

/** "Add control": the field search, and the types a control can start from. */
export const AddControlMenuStory: Story = {
    name: 'Add control menu',
    args: { initialRule: rules.firstName, field: fields.firstName },
    render: () => (
        <AddControlMenu
            fields={Object.values(fields)}
            tabs={tabs}
            withTypes
            onPickField={fn()}
            onPickType={fn()}
        />
    ),
};

/** A text control with no tiles yet: typed values, named on open. */
export const NewTextControl: Story = {
    args: {
        initialRule: createTypeControlRule(DimensionType.STRING),
        field: null,
        controlType: DimensionType.STRING,
        appliedTileCount: 0,
    },
};

/** A date control with no tiles yet, in the past. */
export const NewDateControl: Story = {
    args: {
        initialRule: getFilterRuleWithOperator(
            FilterType.DATE,
            undefined,
            createTypeControlRule(DimensionType.DATE),
            FilterOperator.IN_THE_PAST,
        ),
        field: null,
        controlType: DimensionType.DATE,
        appliedTileCount: 0,
    },
};

/** Mapped: suggestions come from the first mapped field, Customers Region. */
export const NewControlMapped: Story = {
    args: {
        initialRule: {
            ...createTypeControlRule(DimensionType.STRING),
            label: 'Region',
            values: ['EMEA', 'APAC'],
            disabled: false,
            tileTargets: getMappedTileTargets(fields.region),
        },
        field: fields.region,
        controlType: DimensionType.STRING,
        appliedTileCount: MAPPED_TILE_COUNT,
    },
};

type FlowStep =
    | { step: 'menu' }
    | { step: 'field'; field: FilterableDimension }
    | { step: 'type'; type: ControlType };

const AddControlFlowStory: FC<StoryProps> = (args) => {
    const [flow, setFlow] = useState<FlowStep>({ step: 'menu' });
    if (flow.step === 'menu')
        return (
            <AddControlMenu
                fields={Object.values(fields)}
                tabs={tabs}
                withTypes
                onPickField={(field) =>
                    setFlow({
                        step: 'field',
                        field: field as FilterableDimension,
                    })
                }
                onPickType={(type) => setFlow({ step: 'type', type })}
            />
        );
    const onCancel = () => {
        args.onCancel();
        setFlow({ step: 'menu' });
    };
    return flow.step === 'field' ? (
        <StatefulPopover
            {...args}
            initialRule={createDashboardFilterRuleFromField({
                field: flow.field,
                availableTileFilters: {},
                isTemporary: false,
            })}
            field={flow.field}
            controlType={null}
            mapsTo={null}
            onCancel={onCancel}
        />
    ) : (
        <StatefulPopover
            {...args}
            initialRule={createTypeControlRule(flow.type)}
            field={null}
            controlType={flow.type}
            mapsTo={MAPS_TO[flow.type]}
            appliedTileCount={0}
            onCancel={onCancel}
        />
    );
};

/** The whole flow: a type opens a new control, "Choose tiles" maps it, Cancel goes back. */
export const AddControlFlow: Story = {
    args: { initialRule: rules.firstName, field: fields.firstName },
    render: (args) => <AddControlFlowStory {...args} />,
};
