import {
    FilterOperator,
    FilterType,
    getFilterOperatorOptions,
    interpolateUiString,
    supportsSingleValue,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Menu,
    Paper,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconLayoutGrid,
    IconLayoutList,
    IconListCheck,
    IconPencil,
    IconSettings,
    IconSql,
    IconTable,
    IconX,
    type Icon,
} from '@tabler/icons-react';
import omit from 'lodash/omit';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import FilterInputComponent from '../../components/common/Filters/FilterInputs';
import FilterOperatorOption from '../../components/common/Filters/FilterOperatorOption';
import MantineIcon from '../../components/common/MantineIcon';
import TruncatedText from '../../components/common/TruncatedText';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectControlSections,
    selectDashboardFilters,
    selectDashboardTabs,
    useDashboardSelector,
} from '../../features/dashboard/store';
import {
    formatTileCount,
    formatTilesOf,
} from '../../features/dashboardControls/fieldLabels';
import classes from '../../features/dashboardControls/FilterEditor.module.css';
import { focusOnMount } from '../../features/dashboardControls/mappingFocus';
import {
    useRefocusAfter,
    type NameExit,
} from '../../features/dashboardControls/nameFocus';
import { withFilterRuleLabel } from '../../features/dashboardControls/sidebarState';
import { ViewerControls } from '../../features/dashboardControls/ViewerControls';
import {
    getFilterRuleWithDisabledState,
    getFilterRuleWithOperator,
    hasFilterValueSet,
    isLockedRequiredMissingValue,
} from '../../features/dashboardFilters/FilterConfiguration/utils';
import { LD_FIELD_COLORS } from '../../theme/fieldColors';
import { getControlTypeOption, type ControlType } from './controlTypes';
import sentenceClasses from './FilterPopoverSentence.module.css';
import { getSettingsSummary, isMissingRequiredValue } from './settingsSummary';

export type PopoverView = 'value' | 'settings';

/** The chips on the actions row, or on a quiet row of their own above it. */
export type FooterLayout = 'inline' | 'row';

const NO_SECTION = 'none';

// From `FilterValueSettings.tsx` (not exported)
const getInputs = (root: HTMLElement | null): HTMLInputElement[] => [
    ...(root?.querySelectorAll('input') ?? []),
];

const isValueless = (operator: FilterRule['operator']) =>
    operator === FilterOperator.NULL || operator === FilterOperator.NOT_NULL;

// From `FilterSettings.tsx` (not exported): the first value input, else the
// first enabled control. The shipped one skips its operator select, an input;
// here the operator is a button, so the value input is the first input
const focusValueOnMount = (node: HTMLElement | null) => {
    // A new control opens naming: its name input keeps focus
    if (node?.querySelector('[data-controls-label]')) return;
    const inputs = [
        ...(node?.querySelectorAll<HTMLInputElement>(
            'input:not([type="hidden"])',
        ) ?? []),
    ];
    // A typed input that owns a list opens it on focus, over the footer: it
    // waits for a click, typing or ArrowDown, and the operator takes focus
    const input =
        inputs.find(
            (candidate) =>
                !candidate.disabled &&
                (candidate.readOnly ||
                    candidate.closest('[aria-haspopup]') === null),
        ) ?? node?.querySelector<HTMLElement>('button:not(:disabled)');
    input?.setAttribute('data-autofocus', '');
    input?.focus({ preventScroll: true });
};

// From `FilterEditor.tsx` (not exported): Apply, else Discard
const focusAnswerOnMount = (node: HTMLElement | null) => {
    const buttons = [
        ...(node?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ];
    (
        buttons.find(
            (button) =>
                !button.disabled && button.dataset.controlsApply !== undefined,
        ) ?? buttons[0]
    )?.focus({ preventScroll: true });
};

// Display only: the menu keeps "is" and "is not"
const getOperatorText = (rule: DashboardFilterRule, label: string) => {
    if ((rule.values?.length ?? 0) < 2) return label;
    if (rule.operator === FilterOperator.EQUALS) return 'is any of';
    if (rule.operator === FilterOperator.NOT_EQUALS) return 'is not any of';
    return label;
};

type Props = {
    rule: DashboardFilterRule;
    /** Null for a SQL column filter, or a control not yet on a tile. */
    field: DashboardFilterableField | null;
    /** A control started from a type, not a field; null for a field's. */
    controlType: ControlType | null;
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

// The editor's name, and its rename: blur and Enter commit, Escape reverts
const NameInput: FC<{
    initial: string;
    placeholder: string;
    onCommit: (text: string) => void;
    onDone: (how: NameExit) => void;
}> = ({ initial, placeholder, onCommit, onDone }) => {
    const [draft, setDraft] = useState(initial);
    const isDone = useRef(false);
    const finish = (text: string, how: NameExit) => {
        if (isDone.current) return;
        isDone.current = true;
        onCommit(text);
        onDone(how);
    };
    return (
        <TextInput
            aria-label="Name"
            data-controls-label
            size="xs"
            flex={1}
            miw={0}
            placeholder={placeholder}
            data-own-escape
            autoFocus
            value={draft}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={(event) =>
                finish(
                    draft,
                    event.relatedTarget instanceof HTMLElement &&
                        event.relatedTarget !== document.body
                        ? 'elsewhere'
                        : 'pointer',
                )
            }
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    finish(draft, 'keyboard');
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(initial, 'keyboard');
                }
            }}
        />
    );
};

const OperatorMenu: FC<{
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    filterType: FilterType;
    onChange: (next: DashboardFilterRule) => void;
}> = ({ rule, field, filterType, onChange }) => {
    const getUiString = useUiStrings();
    const options = useMemo(
        () =>
            getFilterOperatorOptions(
                filterType,
                field ?? undefined,
                getUiString,
            ),
        [filterType, field, getUiString],
    );
    const text = getOperatorText(
        rule,
        options.find((option) => option.value === rule.operator)?.label ??
            rule.operator,
    );
    return (
        <Menu position="bottom-start">
            <Menu.Target>
                <Button
                    variant="subtle"
                    size="compact-xs"
                    flex="0 0 auto"
                    mih={24}
                    aria-label={`Operator: ${text}`}
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
            </Menu.Dropdown>
        </Menu>
    );
};

// A Settings row, as `ViewerControls` draws Required and Lock
const SettingRow: FC<{
    icon: Icon;
    label: string;
    control: ReactNode;
    description: string | null;
}> = ({ icon, label, control, description }) => (
    <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
                <MantineIcon icon={icon} size="sm" color="ldGray.6" />
                <Text size="xs" fw={600}>
                    {label}
                </Text>
            </Group>
            {control}
        </Group>
        {description !== null && (
            <Text size="xs" c="dimmed">
                {description}
            </Text>
        )}
    </Stack>
);

// The shipped picker, with the editor's value rules from `FilterValueSettings`
// and the viewer's clear X from `FilterValueSection`
const ValueBody: FC<{
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    filterType: FilterType;
    isViewer: boolean;
    isCreatingNew: boolean;
    canManageExplore: boolean;
    /** Where a control's values come from, under the value. */
    caption: ReactNode;
    onChange: (next: DashboardFilterRule) => void;
}> = ({
    rule,
    field,
    filterType,
    isViewer,
    isCreatingNew,
    canManageExplore,
    caption,
    onChange,
}) => {
    const getUiString = useUiStrings();
    const root = useRef<HTMLDivElement>(null);
    // Counts the refused edits: the form is remounted on each one, so its
    // inputs show the value the rule kept and not the one that was refused
    const [refusals, setRefusals] = useState(0);
    const [wasRefused, setWasRefused] = useState(false);
    const refocusIndex = useRef(-1);
    const isLockedAndRequired =
        !!rule.lockedTabUuids?.length && !!rule.required;
    const hasRequirement = !!rule.required || !!rule.requiredGroupId;
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
                            filterType === FilterType.STRING
                                ? { closeListOnPick: true }
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
            {caption}
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

export const FilterPopoverSentence: FC<Props> = ({
    rule,
    field,
    controlType,
    filterType,
    isViewer,
    isOwnFilter,
    isCreatingNew,
    canManageExplore,
    appliedTileCount,
    totalTileCount,
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
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const tabs = useDashboardSelector(selectDashboardTabs);
    const sections = useDashboardSelector(selectControlSections);
    const [view, setView] = useState<PopoverView>(initialView);
    const typeOption =
        controlType === null ? null : getControlTypeOption(controlType);
    // A new control opens with its name to fill in
    const [isRenaming, setIsRenaming] = useState(
        () => typeOption !== null && rule.label === undefined,
    );
    const [hadLabelKey] = useState(() => 'label' in rule);
    const { ref: pencilRef, exit } = useRefocusAfter(isRenaming);
    // Back from Settings hands focus to the chip that opened it
    const isBackFromSettings = useRef(false);
    const focusValueView = useCallback((node: HTMLElement | null) => {
        if (!isBackFromSettings.current) focusValueOnMount(node);
    }, []);
    const focusSettingsChip = useCallback((node: HTMLElement | null) => {
        if (node === null || !isBackFromSettings.current) return;
        isBackFromSettings.current = false;
        node.focus({ preventScroll: true });
    }, []);

    const fieldName =
        field?.label ?? (rule.target.isSqlColumn ? rule.target.fieldId : null);
    const name =
        rule.label ??
        typeOption?.newName ??
        fieldName ??
        getUiString('filters.rail.filterName');
    const canChooseTiles = !isViewer || isOwnFilter;
    const hasSingleValueSetting =
        !isViewer && supportsSingleValue(filterType, rule.operator);

    const applyBlockedReason = isViewer
        ? null
        : isMissingRequiredValue(rule, dashboardFilters)
          ? getUiString('filters.config.applyRequiredTooltip')
          : appliedTileCount === 0
            ? getUiString('filters.notAppliedToAnyTiles')
            : null;

    const tilesOf = formatTilesOf(
        getUiString,
        appliedTileCount,
        totalTileCount,
    );
    const tileCount =
        appliedTileCount === 0
            ? 'no tiles'
            : appliedTileCount === totalTileCount
              ? formatTileCount(getUiString, totalTileCount)
              : `${tilesOf.count} ${tilesOf.noun}`;
    const appliesTo = interpolateUiString(
        getUiString('filters.rail.appliesTo'),
        { tiles: tileCount },
    );
    const settingsSummary = getSettingsSummary({
        rule,
        filters: dashboardFilters,
        tabs,
        sections,
        singleValue:
            hasSingleValueSetting && rule.singleValue
                ? getUiString('filters.inputs.singleValue')
                : null,
        getRuleName: (other) => other.label ?? other.target.fieldId,
    });
    const isRow = footerLayout === 'row';

    const chooseTiles = getUiString('filters.rail.chooseTiles');
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

    const sectionValue = sections.some(({ id }) => id === rule.sectionId)
        ? (rule.sectionId ?? NO_SECTION)
        : NO_SECTION;
    const settingRows = [
        sections.length > 0 && (
            <SettingRow
                key="section"
                icon={IconLayoutList}
                label="Section"
                description={null}
                control={
                    <Select
                        size="xs"
                        w={160}
                        aria-label="Section"
                        allowDeselect={false}
                        data={[
                            { value: NO_SECTION, label: 'No section' },
                            ...sections.map((section) => ({
                                value: section.id,
                                label:
                                    section.name ||
                                    getUiString('filters.rail.untitledSection'),
                            })),
                        ]}
                        value={sectionValue}
                        onChange={(next) => {
                            if (next === null) return;
                            onChange(
                                next === NO_SECTION
                                    ? (omit(
                                          rule,
                                          'sectionId',
                                      ) as DashboardFilterRule)
                                    : { ...rule, sectionId: next },
                            );
                        }}
                    />
                }
            />
        ),
        hasSingleValueSetting && (
            <SettingRow
                key="multiple"
                icon={IconListCheck}
                label={getUiString('filters.inputs.multipleValues')}
                description={
                    rule.singleValue
                        ? 'Prevent selection of multiple values'
                        : 'Allow selection of multiple values'
                }
                control={
                    <Switch
                        size="xs"
                        aria-label={getUiString(
                            'filters.inputs.multipleValues',
                        )}
                        checked={!rule.singleValue}
                        onChange={(event) =>
                            onChange({
                                ...rule,
                                singleValue: !event.currentTarget.checked,
                            })
                        }
                    />
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
                            isBackFromSettings.current = true;
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
                {typeOption !== null ? (
                    <MantineIcon
                        icon={typeOption.icon}
                        size="lg"
                        color={LD_FIELD_COLORS.dimension.color}
                    />
                ) : field ? (
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
                            typeOption !== null
                                ? 'Name this control'
                                : field
                                  ? `Label for ${field.label}`
                                  : 'Filter label'
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
                    onChange={onChange}
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
                    caption={
                        typeOption === null ? null : field ? (
                            <Group gap={4} wrap="nowrap">
                                <MantineIcon
                                    icon={IconTable}
                                    size={14}
                                    color="dimmed"
                                />
                                <Text fz="xs" c="dimmed" truncate>
                                    {`Values from ${field.tableLabel} · ${field.label}`}
                                </Text>
                            </Group>
                        ) : filterType === FilterType.STRING ? (
                            <Text fz="xs" c="dimmed">
                                Suggestions appear once the control applies to a
                                tile
                            </Text>
                        ) : null
                    }
                    onChange={onChange}
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
                            getUiString('filters.rail.applyChangesFirst'),
                            { filter: name },
                        )}
                    </Text>
                    <Group gap="xs" wrap="nowrap" flex="0 0 auto">
                        <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => onResolvePending(false)}
                        >
                            {getUiString('filters.rail.discard')}
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
