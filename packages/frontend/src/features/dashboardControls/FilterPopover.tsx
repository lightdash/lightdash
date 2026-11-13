import {
    FilterOperator,
    FilterType,
    getFilterOperatorOptions,
    interpolateUiString,
    supportsSingleValue,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Menu,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconCheck,
    IconChevronDown,
    IconInfoCircle,
    IconLayoutGrid,
    IconPencil,
    IconRotate2,
    IconSettings,
    IconSql,
} from '@tabler/icons-react';
import { omit } from 'es-toolkit/compat';
import { useId, useMemo, useState, type FC, type ReactNode } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import FilterOperatorOption from '../../components/common/Filters/FilterOperatorOption';
import MantineIcon from '../../components/common/MantineIcon';
import TruncatedText from '../../components/common/TruncatedText';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { LD_FIELD_COLORS } from '../../theme/fieldColors';
import {
    selectControlSections,
    selectDashboardTabs,
    useDashboardSelector,
} from '../dashboard/store';
import {
    getFilterRuleRevertableObject,
    getFilterRuleWithOperator,
    hasSavedFilterValueChanged,
} from '../dashboardFilters/FilterConfiguration/utils';
import { useDashboardFilterField } from '../dashboardFilters/FilterRequirements/useDashboardFilterField';
import { getDashboardFilterRuleLabel } from '../dashboardFilters/FilterRequirements/utils';
import { useControlContractClasses } from './controlContractClasses';
import { DropdownClass } from './DropdownClass';
import {
    focusAnswerOnMount,
    focusStringValueOnMount,
    focusValueOnMount,
} from './editorFocus';
import { formatTileCount, formatTilesOf } from './fieldLabels';
import classes from './FilterEditor.module.css';
import { FilterValueSettings, LockedRequiredNote } from './FilterValueSettings';
import { focusOnMount } from './mappingFocus';
import { useRefocusAfter } from './nameFocus';
import { NameInput } from './NameInput';
import { SectionSetting } from './SectionSetting';
import { getSettingsSummary } from './settingsSummary';
import { withFilterRuleLabel } from './sidebarState';
import { getApplyBlockedReason } from './useApplyBlockedReason';
import { useRuleEdits } from './useRuleEdits';
import { useSettingsChipFocus } from './useSettingsChipFocus';
import { ViewerControls } from './ViewerControls';

/** The value, or an editor's settings, in the same popover. */
export type EditorView = 'value' | 'settings';

// As saved, `disabled` and `values` may be absent; the draft spells them out
const asComparable = (rule: DashboardFilterRule): DashboardFilterRule => ({
    ...rule,
    disabled: !!rule.disabled,
    values: rule.values ?? [],
});

const isValueless = (operator: FilterOperator) =>
    operator === FilterOperator.NULL || operator === FilterOperator.NOT_NULL;

/** At the top while a pill or Add waits on the draft. */
const EditorPrompt: FC<{
    name: string;
    applyBlockedReason: string | null;
    onResolvePending: (shouldApply: boolean) => void;
}> = ({ name, applyBlockedReason, onResolvePending }) => {
    const getUiString = useUiStrings();
    return (
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
    );
};

/** Cancel and Apply; Apply says why it is off. */
export const EditorActions: FC<{
    applyBlockedReason: string | null;
    /** Off with no reason to give: a filter left with no field. */
    isApplyDisabled: boolean;
    isAsking: boolean;
    /** In place of "Apply" (default). */
    applyLabel?: string;
    onCancel: () => void;
    onApply: () => void;
}> = ({
    applyBlockedReason,
    isApplyDisabled,
    isAsking,
    applyLabel,
    onCancel,
    onApply,
}) => {
    const getUiString = useUiStrings();
    return (
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
                        disabled={
                            isApplyDisabled || applyBlockedReason !== null
                        }
                        onClick={onApply}
                    >
                        {applyLabel ?? getUiString('filters.apply')}
                    </Button>
                </Box>
            </Tooltip>
        </Group>
    );
};

/** Every control editor's frame: the question over a dimmed, inert body, then the footer. */
export const EditorFrame: FC<{
    name: string;
    applyBlockedReason: string | null;
    isAsking: boolean;
    onResolvePending: (shouldApply: boolean) => void;
    rootRef?: (node: HTMLElement | null) => void;
    /** Null: no footer (a new filter before its field). */
    footer: ReactNode;
    children: ReactNode;
}> = ({
    name,
    applyBlockedReason,
    isAsking,
    onResolvePending,
    rootRef,
    footer,
    children,
}) => (
    <Box className={classes.root} role="dialog" aria-label={name} ref={rootRef}>
        {isAsking && (
            <EditorPrompt
                name={name}
                applyBlockedReason={applyBlockedReason}
                onResolvePending={onResolvePending}
            />
        )}
        {/* While the question is open it is the only live part */}
        <Box
            className={classes.body}
            data-dimmed={isAsking || undefined}
            inert={isAsking || undefined}
        >
            {children}
            {footer !== null && (
                <Group
                    justify="flex-end"
                    gap="xs"
                    wrap="nowrap"
                    className={classes.footer}
                >
                    {footer}
                </Group>
            )}
        </Box>
    </Box>
);

const OperatorMenu: FC<{
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    filterType: FilterType;
    /** "Allow multiple values", where the shipped "Multiple values" showed. */
    withMultipleValues: boolean;
    onChange: (next: DashboardFilterRule) => void;
}> = ({ rule, field, filterType, withMultipleValues, onChange }) => {
    const getUiString = useUiStrings();
    const multipleDescriptionId = useId();
    const multipleLabelId = useId();
    // Mantine's menu sets its own dropdown class over `DropdownClass`'s
    const contractClasses = useControlContractClasses();
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
                    data-controls-operator
                    aria-label={interpolateUiString(
                        getUiString('controls.operatorLabel'),
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
            <Menu.Dropdown
                className={
                    contractClasses === null
                        ? classes.menu
                        : `${classes.menu} ${contractClasses.filterDropdown}`
                }
            >
                {options.map((option) => (
                    <Menu.Item
                        key={option.value}
                        rightSection={
                            option.value === rule.operator ? (
                                <MantineIcon icon={IconCheck} size={14} />
                            ) : null
                        }
                        onClick={() => {
                            // As the shipped select: a re-pick changes nothing,
                            // where the operator helper would reset the value
                            if (option.value === rule.operator) return;
                            onChange(
                                getFilterRuleWithOperator(
                                    filterType,
                                    field ?? undefined,
                                    rule,
                                    option.value,
                                ),
                            );
                        }}
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
                        {/* A checkbox item: arrow keys reach it, and toggling keeps the menu open */}
                        <Menu.CheckboxItem
                            closeMenuOnClick={false}
                            checked={allowsMultiple}
                            aria-labelledby={multipleLabelId}
                            aria-describedby={multipleDescriptionId}
                            onChange={(checked) =>
                                onChange({ ...rule, singleValue: !checked })
                            }
                        >
                            <Text
                                span
                                fz="sm"
                                fw={400}
                                display="block"
                                id={multipleLabelId}
                            >
                                Allow multiple values
                            </Text>
                            <Text
                                span
                                fz="xs"
                                c="dimmed"
                                display="block"
                                id={multipleDescriptionId}
                            >
                                {allowsMultiple
                                    ? 'Viewers can pick multiple values'
                                    : 'Viewers pick one value'}
                            </Text>
                        </Menu.CheckboxItem>
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

type Props = {
    rule: DashboardFilterRule;
    /** Null for a SQL column filter. */
    field: DashboardFilterableField | null;
    filterType: FilterType;
    isViewer: boolean;
    /** Editors, and a viewer on their own filter: "Choose tiles". */
    canChooseTiles: boolean;
    /** A viewer's new filter: the shipped "Value" label above the value. */
    isCreatingNew: boolean;
    /** The viewer's "manage Explore" ability, which gates the clear X. */
    canManageExplore: boolean;
    /** A viewer's saved filter as the dashboard was saved: its reset. */
    savedRule: DashboardFilterRule | null;
    /** Tiles the filter is on, over every tab. */
    appliedTileCount: number;
    /** The tiles that can take a filter, as mapping counts them. */
    totalTileCount: number;
    /** Every filter as edited so far, this one too: the required group and
     * the Settings summary read it. */
    filters: DashboardFilters;
    /** "Apply changes to {filter} first?" is waiting on an answer. */
    isAsking: boolean;
    initialView: EditorView;
    onChange: (next: DashboardFilterRule) => void;
    onChangeOthers: (rules: DashboardFilterRule[]) => void;
    onCancel: () => void;
    onApply: () => void;
    onChooseTiles: () => void;
    /** Opens the bar's "Filter rules"; null when it cannot be reached. */
    onEditRules: (() => void) | null;
    onResolvePending: (shouldApply: boolean) => void;
};

// The editor's popover as a sentence: the field, its name and operator, the
// value; tiles and Settings as chips above Cancel and Apply
export const FilterPopover: FC<Props> = ({
    rule,
    field,
    filterType,
    isViewer,
    canChooseTiles,
    isCreatingNew,
    canManageExplore,
    savedRule,
    appliedTileCount,
    totalTileCount,
    filters,
    isAsking,
    initialView,
    onChange,
    onChangeOthers,
    onCancel,
    onApply,
    onChooseTiles,
    onEditRules,
    onResolvePending,
}) => {
    const getUiString = useUiStrings();
    const contractClasses = useControlContractClasses();
    const tabs = useDashboardSelector(selectDashboardTabs);
    const sections = useDashboardSelector(selectControlSections);
    const getField = useDashboardFilterField();
    const [view, setView] = useState<EditorView>(initialView);
    const [isRenaming, setIsRenaming] = useState(false);
    // As the filter was opened: an emptied label goes back to exactly that
    const [hadLabelKey] = useState(() => 'label' in rule);
    const { ref: pencilRef, exit } = useRefocusAfter(isRenaming);
    const { focusValueView, focusSettingsChip, markBackFromSettings } =
        // A text value's list stays shut on focus
        useSettingsChipFocus(
            filterType === FilterType.STRING
                ? focusStringValueOnMount
                : focusValueOnMount,
        );
    const edits = useRuleEdits(rule, isViewer, onChange);

    const fieldName =
        field?.label ?? (rule.target.isSqlColumn ? rule.target.fieldId : null);
    const name = rule.label ?? fieldName ?? getUiString('controls.filterName');
    const description = field?.description?.trim();
    const applyBlockedReason = getApplyBlockedReason({
        rule,
        filters,
        appliedTileCount,
        isViewer,
        getUiString,
    });
    const canReset =
        isViewer &&
        savedRule !== null &&
        hasSavedFilterValueChanged(asComparable(savedRule), asComparable(rule));

    const tilesOf = formatTilesOf(
        getUiString,
        appliedTileCount,
        totalTileCount,
    );
    // "0 tiles", "6 tiles" or "2 of 6 tiles": the registry's wording
    const tileCount =
        appliedTileCount === 0 || appliedTileCount === totalTileCount
            ? formatTileCount(getUiString, appliedTileCount)
            : `${tilesOf.count} ${tilesOf.noun}`;
    const appliesTo = interpolateUiString(getUiString('controls.appliesTo'), {
        tiles: tileCount,
    });
    const chooseTiles = getUiString('controls.chooseTiles');
    const settingsSummary = getSettingsSummary({
        rule,
        filters,
        tabs,
        sections,
        getRuleName: (other) => getDashboardFilterRuleLabel(other, getField),
    });

    const chips = view === 'value' && (canChooseTiles || !isViewer) && (
        <Group
            gap="xs"
            align="flex-start"
            px="md"
            pb="sm"
            pt={isValueless(rule.operator) ? 'sm' : undefined}
        >
            {canChooseTiles && (
                <Button
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    flex="0 0 auto"
                    mih={24}
                    aria-label={`${appliesTo}. ${chooseTiles}`}
                    leftSection={
                        <MantineIcon icon={IconLayoutGrid} size={14} />
                    }
                    onClick={onChooseTiles}
                >
                    <Text span fz="xs">
                        <Text span fz="xs" c="dimmed">
                            {appliesTo}
                        </Text>
                        {` · ${chooseTiles}`}
                    </Text>
                </Button>
            )}
            {/* Its settings are the dashboard's */}
            {!isViewer && (
                <Button
                    ref={focusSettingsChip}
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    miw={0}
                    mih={24}
                    classNames={{
                        root: classes.wrappingChip,
                        label: classes.wrappingChipLabel,
                    }}
                    aria-label={
                        settingsSummary === null
                            ? 'Settings'
                            : `Settings: ${settingsSummary}`
                    }
                    leftSection={<MantineIcon icon={IconSettings} size={14} />}
                    onClick={() => setView('settings')}
                >
                    <Text span fz="xs" lh="xs">
                        Settings
                        {settingsSummary !== null && (
                            <Text span fz="xs" c="dimmed">
                                {` · ${settingsSummary}`}
                            </Text>
                        )}
                    </Text>
                </Button>
            )}
        </Group>
    );

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
                {sections.length > 0 && (
                    <>
                        <SectionSetting
                            sections={sections}
                            sectionId={rule.sectionId ?? null}
                            onChange={(sectionId) =>
                                onChange(
                                    sectionId === null
                                        ? omit(rule, 'sectionId')
                                        : { ...rule, sectionId },
                                )
                            }
                        />
                        <Divider />
                    </>
                )}
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
        <DropdownClass className={contractClasses?.filterDropdown ?? null}>
            <Box ref={focusValueView}>
                <Group gap="xs" wrap="nowrap" className={classes.editorHeader}>
                    {field ? (
                        <FieldIcon item={field} size={16} />
                    ) : (
                        <MantineIcon
                            icon={IconSql}
                            size={16}
                            color={LD_FIELD_COLORS.dimension.color}
                        />
                    )}
                    {isRenaming ? (
                        <NameInput
                            initial={rule.label ?? ''}
                            placeholder={
                                field
                                    ? `Label for ${field.label}`
                                    : 'Filter label'
                            }
                            onCommit={(text) =>
                                onChange(
                                    withFilterRuleLabel(
                                        rule,
                                        text,
                                        hadLabelKey,
                                    ),
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
                    {description && !isRenaming && (
                        <Tooltip
                            fz="xs"
                            label={description}
                            events={{ hover: true, focus: true, touch: true }}
                            multiline
                            maw={300}
                        >
                            <ActionIcon size="xs" aria-label={description}>
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    color="dimmed"
                                />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    <OperatorMenu
                        rule={rule}
                        field={field}
                        filterType={filterType}
                        withMultipleValues={
                            !isViewer &&
                            supportsSingleValue(filterType, rule.operator)
                        }
                        onChange={edits.handleChange}
                    />
                    {!isViewer && !isRenaming && (
                        <Tooltip fz="xs" label="Rename">
                            <ActionIcon
                                size="sm"
                                ml="auto"
                                flex="0 0 auto"
                                aria-label="Rename"
                                ref={pencilRef}
                                onClick={() => setIsRenaming(true)}
                            >
                                <MantineIcon icon={IconPencil} size={14} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
                {isValueless(rule.operator) ? (
                    // No value input, but a refused operator still says why
                    <LockedRequiredNote
                        rule={rule}
                        edits={edits}
                        className={classes.content}
                    />
                ) : (
                    <FilterValueSettings
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
        </DropdownClass>
    );

    return (
        <EditorFrame
            name={name}
            applyBlockedReason={applyBlockedReason}
            isAsking={isAsking}
            onResolvePending={onResolvePending}
            footer={
                <>
                    {canReset && (
                        <Tooltip
                            fz="xs"
                            label={getUiString(
                                'filters.config.resetToOriginal',
                            )}
                        >
                            <Button
                                size="xs"
                                variant="default"
                                aria-label={getUiString(
                                    'filters.config.resetToOriginalAria',
                                )}
                                onClick={() =>
                                    edits.reset({
                                        ...rule,
                                        ...getFilterRuleRevertableObject(
                                            savedRule,
                                        ),
                                    })
                                }
                            >
                                <MantineIcon icon={IconRotate2} />
                            </Button>
                        </Tooltip>
                    )}
                    <EditorActions
                        applyBlockedReason={applyBlockedReason}
                        isApplyDisabled={false}
                        isAsking={isAsking}
                        onCancel={onCancel}
                        onApply={onApply}
                    />
                </>
            }
        >
            {view === 'settings' ? settingsView : valueView}
            {chips}
        </EditorFrame>
    );
};
