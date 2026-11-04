import {
    FilterOperator,
    FilterType,
    getFilterOperatorOptions,
    interpolateUiString,
    supportsSingleValue,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type FilterRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Checkbox,
    Menu,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconLayoutGrid,
    IconPencil,
    IconSettings,
    IconSql,
    IconX,
} from '@tabler/icons-react';
import { omit } from 'es-toolkit/compat';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import FilterInputComponent from '../../components/common/Filters/FilterInputs';
import FilterOperatorOption from '../../components/common/Filters/FilterOperatorOption';
import MantineIcon from '../../components/common/MantineIcon';
import TruncatedText from '../../components/common/TruncatedText';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectControlSections,
    selectDashboardTabs,
    useDashboardSelector,
} from '../../features/dashboard/store';
import {
    formatTileCount,
    formatTilesOf,
} from '../../features/dashboardControls/fieldLabels';
import classes from '../../features/dashboardControls/FilterEditor.module.css';
import { focusOnMount } from '../../features/dashboardControls/mappingFocus';
import { useRefocusAfter } from '../../features/dashboardControls/nameFocus';
import { withFilterRuleLabel } from '../../features/dashboardControls/sidebarState';
import { ViewerControls } from '../../features/dashboardControls/ViewerControls';
import {
    getFilterRuleWithDisabledState,
    getFilterRuleWithOperator,
    hasFilterValueSet,
    isLockedRequiredMissingValue,
} from '../../features/dashboardFilters/FilterConfiguration/utils';
import { LD_FIELD_COLORS } from '../../theme/fieldColors';
import { CONTROL_STRINGS } from './controlStrings';
import sentenceClasses from './FilterPopover.module.css';
import {
    focusAnswerOnMount,
    focusStringValueOnMount,
    focusValueOnMount,
} from './focus';
import { NameInput } from './NameInput';
import { SectionSetting } from './SectionSetting';
import { getSettingsSummary, isMissingRequiredValue } from './settingsSummary';
import { useSettingsChipFocus } from './useSettingsChipFocus';
import { type PopoverView } from './views';

/** The chips on the actions row, or on a quiet row of their own above it. */
export type FooterLayout = 'inline' | 'row';

// From `FilterValueSettings.tsx` (not exported)
const getInputs = (root: HTMLElement | null): HTMLInputElement[] => [
    ...(root?.querySelectorAll('input') ?? []),
];

const isValueless = (operator: FilterRule['operator']) =>
    operator === FilterOperator.NULL || operator === FilterOperator.NOT_NULL;

type Props = {
    rule: DashboardFilterRule;
    /** Null for a SQL column filter. */
    field: DashboardFilterableField | null;
    filterType: FilterType;
    isViewer: boolean;
    /** A viewer's own filter: not saved for everyone. */
    isOwnFilter: boolean;
    /** A viewer's new filter: the shipped "Value" label above the value. */
    isCreatingNew: boolean;
    /** The viewer's "manage Explore" ability, which gates the clear X. */
    canManageExplore: boolean;
    appliedTileCount: number;
    totalTileCount: number;
    /** Every filter as edited so far (the provider's draft), this one too:
     * the required group and the Settings summary read it. */
    filters: DashboardFilters;
    /** "Apply changes to {filter} first?" is waiting on an answer. */
    isAsking: boolean;
    initialView: PopoverView;
    footerLayout: FooterLayout;
    onChange: (next: DashboardFilterRule) => void;
    onChangeOthers: (rules: DashboardFilterRule[]) => void;
    onCancel: () => void;
    onApply: () => void;
    onChooseTiles: () => void;
    onEditRules: () => void;
    onResolvePending: (shouldApply: boolean) => void;
};

const OperatorMenu: FC<{
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    filterType: FilterType;
    /** "Allow multiple values", where the shipped "Multiple values" shows. */
    withMultipleValues: boolean;
    onChange: (next: DashboardFilterRule) => void;
}> = ({ rule, field, filterType, withMultipleValues, onChange }) => {
    const getUiString = useUiStrings();
    const allowsMultiple = !rule.singleValue;
    const options = useMemo(
        () =>
            getFilterOperatorOptions(
                filterType,
                field ?? undefined,
                getUiString,
            ),
        [filterType, field, getUiString],
    );
    const text =
        options.find((option) => option.value === rule.operator)?.label ??
        rule.operator;
    return (
        <Menu position="bottom-start">
            <Menu.Target>
                <Button
                    variant="subtle"
                    size="compact-xs"
                    flex="0 0 auto"
                    mih={24}
                    aria-label={interpolateUiString(
                        CONTROL_STRINGS.operatorLabel,
                        { operator: text },
                    )}
                    rightSection={
                        <MantineIcon
                            icon={IconChevronDown}
                            size={14}
                            color="dimmed"
                        />
                    }
                >
                    <Text span fz="sm" fw={400}>
                        {text}
                    </Text>
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                {options.map((option) => (
                    <Menu.Item
                        key={option.value}
                        rightSection={
                            option.value === rule.operator ? (
                                <MantineIcon icon={IconCheck} size={14} />
                            ) : null
                        }
                        onClick={() =>
                            onChange(
                                getFilterRuleWithOperator(
                                    filterType,
                                    field ?? undefined,
                                    rule,
                                    option.value,
                                ),
                            )
                        }
                    >
                        <FilterOperatorOption
                            operator={option.value}
                            label={option.label}
                        />
                    </Menu.Item>
                ))}
                {withMultipleValues && (
                    <>
                        <Menu.Divider />
                        {/* A checkbox, not an item: toggling keeps the menu open */}
                        <Box px="sm" py="xs">
                            <Checkbox
                                size="xs"
                                // The theme dims checkbox labels; this one reads
                                // as a menu item, so it takes the items' text
                                label={
                                    <Text
                                        span
                                        fz="sm"
                                        fw={400}
                                        c="var(--mantine-color-text)"
                                    >
                                        {CONTROL_STRINGS.allowMultipleValues}
                                    </Text>
                                }
                                description={
                                    allowsMultiple
                                        ? CONTROL_STRINGS.multipleValuesHelper
                                        : CONTROL_STRINGS.oneValueHelper
                                }
                                checked={allowsMultiple}
                                onChange={(event) =>
                                    onChange({
                                        ...rule,
                                        singleValue:
                                            !event.currentTarget.checked,
                                    })
                                }
                            />
                        </Box>
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

// Every edit, the operator's included, as the shipped `FilterValueSettings`
// writes it: an editor's rule is off while it has no value, a viewer's is on,
// and an edit that would empty a locked, required filter is refused
const useRuleEdits = (
    rule: DashboardFilterRule,
    isViewer: boolean,
    onChange: (next: DashboardFilterRule) => void,
) => {
    const root = useRef<HTMLDivElement>(null);
    // Counts the refused edits: the form is remounted on each one, so its
    // inputs show the value the rule kept and not the one that was refused
    const [refusals, setRefusals] = useState(0);
    const [wasRefused, setWasRefused] = useState(false);
    const refocusIndex = useRef(-1);
    const handleChange = (next: DashboardFilterRule) => {
        const written = isViewer
            ? getFilterRuleWithDisabledState(next, false)
            : { ...next, disabled: !hasFilterValueSet(next) };
        if (
            isLockedRequiredMissingValue(written) &&
            !isLockedRequiredMissingValue(rule)
        ) {
            refocusIndex.current = getInputs(root.current).findIndex(
                (input) => input === document.activeElement,
            );
            setRefusals((count) => count + 1);
            setWasRefused(true);
            return;
        }
        setWasRefused(false);
        onChange(written);
    };

    // Focus is a DOM matter: the remount took it from the input in use. A
    // typed one has its text selected, so typing replaces the kept value
    useEffect(() => {
        const input = getInputs(root.current)[refocusIndex.current];
        refocusIndex.current = -1;
        if (input === undefined) return;
        input.focus();
        if (!input.readOnly) input.select();
    }, [refusals]);

    return { root, refusals, wasRefused, handleChange };
};

// The shipped picker, with the viewer's clear X from `FilterValueSection`
const ValueBody: FC<{
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    filterType: FilterType;
    isViewer: boolean;
    isCreatingNew: boolean;
    canManageExplore: boolean;
    edits: ReturnType<typeof useRuleEdits>;
}> = ({
    rule,
    field,
    filterType,
    isViewer,
    isCreatingNew,
    canManageExplore,
    edits,
}) => {
    const getUiString = useUiStrings();
    const { root, refusals, wasRefused, handleChange } = edits;
    const isLockedAndRequired =
        !!rule.lockedTabUuids?.length && !!rule.required;
    const hasRequirement = !!rule.required || !!rule.requiredGroupId;

    const valueCount = rule.values?.length ?? 0;
    return (
        <Stack ref={root} gap="xs" className={classes.content}>
            {isViewer && isCreatingNew && (
                <Text size="xs" fw={500}>
                    {getUiString('filters.config.valueLabel')}
                </Text>
            )}
            <Group
                key={`form-${refusals}`}
                gap="xs"
                wrap="nowrap"
                align="flex-start"
            >
                <Box flex={1} miw={0} className={sentenceClasses.form}>
                    <FilterInputComponent
                        filterType={filterType}
                        field={field ?? undefined}
                        // Shown enabled: no value is any value
                        rule={
                            !isViewer && rule.disabled
                                ? { ...rule, disabled: false }
                                : rule
                        }
                        popoverProps={
                            // As the shipped `isListClosedOnPick`
                            filterType === FilterType.STRING
                                ? {
                                      closeListOnPick: true,
                                      openListOnFocus: false,
                                  }
                                : undefined
                        }
                        onChange={handleChange}
                    />
                </Box>
                {isViewer && canManageExplore && !hasRequirement && (
                    <Tooltip
                        fz="xs"
                        label={getUiString(
                            rule.disabled
                                ? 'filters.config.alreadyAnyValue'
                                : valueCount === 0
                                  ? 'filters.config.noValueToClear'
                                  : 'filters.config.clearToAnyValue',
                        )}
                    >
                        <ActionIcon
                            size="sm"
                            mt={4}
                            aria-label={getUiString(
                                'filters.config.clearToAnyValue',
                            )}
                            disabled={rule.disabled || valueCount === 0}
                            onClick={() =>
                                handleChange({
                                    ...rule,
                                    values: [],
                                    ...(filterType === FilterType.DATE
                                        ? { settings: undefined }
                                        : {}),
                                })
                            }
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
            {isLockedAndRequired && (
                <Text
                    key={wasRefused ? refusals : 'at-rest'}
                    fz="xs"
                    c={wasRefused ? 'red' : 'dimmed'}
                    fw={wasRefused ? 500 : undefined}
                    role={wasRefused ? 'alert' : undefined}
                >
                    {getUiString('filters.config.applyLockedRequiredTooltip')}
                </Text>
            )}
        </Stack>
    );
};

export const FilterPopover: FC<Props> = ({
    rule,
    field,
    filterType,
    isViewer,
    isOwnFilter,
    isCreatingNew,
    canManageExplore,
    appliedTileCount,
    totalTileCount,
    filters,
    isAsking,
    initialView,
    footerLayout,
    onChange,
    onChangeOthers,
    onCancel,
    onApply,
    onChooseTiles,
    onEditRules,
    onResolvePending,
}) => {
    const getUiString = useUiStrings();
    const tabs = useDashboardSelector(selectDashboardTabs);
    const sections = useDashboardSelector(selectControlSections);
    const [view, setView] = useState<PopoverView>(initialView);
    const [isRenaming, setIsRenaming] = useState(false);
    const [hadLabelKey] = useState(() => 'label' in rule);
    const { ref: pencilRef, exit } = useRefocusAfter(isRenaming);
    const { focusValueView, focusSettingsChip, markBackFromSettings } =
        // As the shipped editor: a text value's list stays shut on focus
        useSettingsChipFocus(
            filterType === FilterType.STRING
                ? focusStringValueOnMount
                : focusValueOnMount,
        );
    const edits = useRuleEdits(rule, isViewer, onChange);

    const fieldName =
        field?.label ?? (rule.target.isSqlColumn ? rule.target.fieldId : null);
    const name = rule.label ?? fieldName ?? getUiString('controls.filterName');
    const canChooseTiles = !isViewer || isOwnFilter;
    const hasSingleValueSetting =
        !isViewer && supportsSingleValue(filterType, rule.operator);

    // A viewer must set a required filter; an editor may leave it empty
    // (viewers set it), unless it is locked, which no viewer could then set
    const applyBlockedReason = isViewer
        ? isMissingRequiredValue(rule, filters)
            ? getUiString('filters.config.applyRequiredTooltip')
            : null
        : isLockedRequiredMissingValue(rule)
          ? getUiString('filters.config.applyLockedRequiredTooltip')
          : appliedTileCount === 0
            ? getUiString('filters.notAppliedToAnyTiles')
            : null;

    const tilesOf = formatTilesOf(
        getUiString,
        appliedTileCount,
        totalTileCount,
    );
    const tileCount =
        // "0 tiles", "6 tiles" or "2 of 6 tiles": the registry's wording
        appliedTileCount === 0 || appliedTileCount === totalTileCount
            ? formatTileCount(getUiString, appliedTileCount)
            : `${tilesOf.count} ${tilesOf.noun}`;
    const appliesTo = interpolateUiString(getUiString('controls.appliesTo'), {
        tiles: tileCount,
    });
    const settingsSummary = getSettingsSummary({
        rule,
        filters,
        tabs,
        sections,
        getRuleName: (other) => other.label ?? other.target.fieldId,
    });
    const isRow = footerLayout === 'row';

    const chooseTiles = getUiString('controls.chooseTiles');
    const tilesChip = canChooseTiles && (
        <Tooltip fz="xs" label={chooseTiles} disabled={isRow}>
            <Button
                variant="subtle"
                color="gray"
                size="compact-xs"
                flex="0 0 auto"
                mih={24}
                aria-label={`${appliesTo}. ${chooseTiles}`}
                leftSection={<MantineIcon icon={IconLayoutGrid} size={14} />}
                rightSection={
                    isRow ? null : (
                        <MantineIcon icon={IconChevronRight} size={12} />
                    )
                }
                onClick={onChooseTiles}
            >
                {isRow ? (
                    <Text span fz="xs">
                        <Text span fz="xs" c="dimmed">
                            {appliesTo}
                        </Text>
                        {` · ${chooseTiles}`}
                    </Text>
                ) : (
                    tileCount
                )}
            </Button>
        </Tooltip>
    );

    const settingsChip = !isViewer && (
        <Tooltip
            fz="xs"
            label={settingsSummary}
            // The row's chip wraps instead, so it never hides its summary
            disabled={isRow || settingsSummary === null}
        >
            <Button
                ref={focusSettingsChip}
                variant="subtle"
                color="gray"
                size="compact-xs"
                miw={0}
                mih={24}
                classNames={
                    isRow
                        ? {
                              root: sentenceClasses.wrappingChip,
                              inner: sentenceClasses.wrappingChipInner,
                              section: sentenceClasses.wrappingChipSection,
                              label: sentenceClasses.wrappingChipLabel,
                          }
                        : undefined
                }
                aria-label={
                    settingsSummary === null
                        ? 'Settings'
                        : `Settings: ${settingsSummary}`
                }
                leftSection={<MantineIcon icon={IconSettings} size={14} />}
                onClick={() => setView('settings')}
            >
                {isRow ? (
                    <Text span fz="xs" lh="xs">
                        Settings
                        {settingsSummary !== null && (
                            <Text span fz="xs" c="dimmed">
                                {` · ${settingsSummary}`}
                            </Text>
                        )}
                    </Text>
                ) : (
                    <Text span fz="xs" truncate>
                        {settingsSummary ?? 'Settings'}
                    </Text>
                )}
            </Button>
        </Tooltip>
    );

    const hasChips = view === 'value' && (canChooseTiles || !isViewer);

    const actions = (
        <Group gap="xs" wrap="nowrap" flex="0 0 auto">
            <Button variant="default" size="xs" onClick={onCancel}>
                {getUiString('filters.actions.cancel')}
            </Button>
            <Tooltip
                fz="xs"
                label={applyBlockedReason}
                disabled={applyBlockedReason === null}
            >
                <Box>
                    <Button
                        size="xs"
                        data-controls-apply={!isAsking || undefined}
                        disabled={applyBlockedReason !== null}
                        onClick={onApply}
                    >
                        {getUiString('filters.apply')}
                    </Button>
                </Box>
            </Tooltip>
        </Group>
    );

    const footer = isRow ? (
        <>
            {hasChips && (
                <Group
                    gap="xs"
                    align="flex-start"
                    px="md"
                    pb="sm"
                    pt={isValueless(rule.operator) ? 'sm' : undefined}
                >
                    {tilesChip}
                    {settingsChip}
                </Group>
            )}
            <Group justify="flex-end" wrap="nowrap" className={classes.footer}>
                {actions}
            </Group>
        </>
    ) : (
        <Group
            justify="space-between"
            gap="xs"
            wrap="nowrap"
            className={classes.footer}
        >
            <Group gap="xs" wrap="nowrap" miw={0}>
                {hasChips && tilesChip}
                {hasChips && settingsChip}
            </Group>
            {actions}
        </Group>
    );

    const settingRows = [
        sections.length > 0 && (
            <SectionSetting
                key="section"
                sections={sections}
                sectionId={rule.sectionId ?? null}
                onChange={(sectionId) =>
                    onChange(
                        sectionId === null
                            ? (omit(rule, 'sectionId') as DashboardFilterRule)
                            : { ...rule, sectionId },
                    )
                }
            />
        ),
    ].filter((row) => row !== false);

    const settingsView = (
        <Stack gap="sm" className={classes.content}>
            <Group gap="xs" wrap="nowrap">
                <Tooltip fz="xs" label="Back">
                    <ActionIcon
                        size="sm"
                        aria-label="Back"
                        ref={focusOnMount}
                        onClick={() => {
                            markBackFromSettings();
                            setView('value');
                        }}
                    >
                        <MantineIcon icon={IconArrowLeft} />
                    </ActionIcon>
                </Tooltip>
                <Box miw={0}>
                    <Title order={6} lh="sm">
                        Settings
                    </Title>
                    <TruncatedText maxWidth="100%" fz="xs" c="dimmed">
                        {name}
                    </TruncatedText>
                </Box>
            </Group>
            <Stack gap="md">
                {settingRows.flatMap((row) => [
                    row,
                    <Divider key={`${row.key}-divider`} />,
                ])}
                <ViewerControls
                    rule={rule}
                    filterType={filterType}
                    field={field}
                    onChange={onChange}
                    onChangeOthers={onChangeOthers}
                    onEditRules={onEditRules}
                />
            </Stack>
        </Stack>
    );

    const valueView = (
        <Box ref={focusValueView}>
            <Group gap="xs" wrap="nowrap" px="md" pt="sm">
                {field ? (
                    <FieldIcon item={field} />
                ) : (
                    <MantineIcon
                        icon={IconSql}
                        size="lg"
                        color={LD_FIELD_COLORS.dimension.color}
                    />
                )}
                {isRenaming ? (
                    <NameInput
                        initial={rule.label ?? ''}
                        placeholder={
                            field
                                ? interpolateUiString(
                                      CONTROL_STRINGS.labelForField,
                                      { field: field.label },
                                  )
                                : CONTROL_STRINGS.filterLabel
                        }
                        onCommit={(text) =>
                            onChange(
                                withFilterRuleLabel(rule, text, hadLabelKey),
                            )
                        }
                        onDone={(how) => {
                            exit.current = how;
                            setIsRenaming(false);
                        }}
                    />
                ) : (
                    <TruncatedText maxWidth="100%" fw={500} miw={0}>
                        {name}
                    </TruncatedText>
                )}
                <OperatorMenu
                    rule={rule}
                    field={field}
                    filterType={filterType}
                    withMultipleValues={hasSingleValueSetting}
                    onChange={edits.handleChange}
                />
                <Group gap={4} wrap="nowrap" ml="auto" flex="0 0 auto">
                    {!isViewer && !isRenaming && (
                        <Tooltip fz="xs" label="Rename">
                            <ActionIcon
                                size="sm"
                                aria-label="Rename"
                                ref={pencilRef}
                                onClick={() => setIsRenaming(true)}
                            >
                                <MantineIcon
                                    icon={IconPencil}
                                    size={14}
                                    strokeWidth={2.25}
                                />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
            </Group>
            {isValueless(rule.operator) ? null : (
                <ValueBody
                    rule={rule}
                    field={field}
                    filterType={filterType}
                    isViewer={isViewer}
                    isCreatingNew={isCreatingNew}
                    canManageExplore={canManageExplore}
                    edits={edits}
                />
            )}
        </Box>
    );

    return (
        <Paper
            shadow="md"
            radius="md"
            w="min(400px, calc(100vw - 56px))"
            role="dialog"
            aria-label={name}
        >
            {isAsking && (
                <Group
                    justify="space-between"
                    wrap="nowrap"
                    gap="xs"
                    className={classes.prompt}
                    ref={focusAnswerOnMount}
                >
                    <Text fz="xs" role="status">
                        {interpolateUiString(
                            getUiString('controls.applyChangesFirst'),
                            { filter: name },
                        )}
                    </Text>
                    <Group gap="xs" wrap="nowrap" flex="0 0 auto">
                        <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => onResolvePending(false)}
                        >
                            {getUiString('controls.discard')}
                        </Button>
                        <Button
                            variant="default"
                            size="xs"
                            data-controls-apply
                            disabled={applyBlockedReason !== null}
                            onClick={() => onResolvePending(true)}
                        >
                            {getUiString('filters.apply')}
                        </Button>
                    </Group>
                </Group>
            )}
            <Box
                className={classes.body}
                data-dimmed={isAsking || undefined}
                inert={isAsking || undefined}
            >
                {view === 'settings' ? settingsView : valueView}
                {footer}
            </Box>
        </Paper>
    );
};
