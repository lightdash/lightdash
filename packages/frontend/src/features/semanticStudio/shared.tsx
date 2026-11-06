/**
 * Building blocks for Semantic Layer: the field table, the details modals,
 * search results and the small controls around them.
 */
import {
    DimensionType,
    FieldType,
    MetricType,
    type Field as LightdashField,
    type WarehouseTypes,
} from '@lightdash/common';
import {
    Anchor,
    Autocomplete,
    Box,
    Button,
    Group,
    Image,
    Menu,
    Modal,
    Paper,
    Stack,
    Switch,
    Text,
    Textarea,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { getHotkeyHandler } from '@mantine/hooks';
import {
    IconBroadcast,
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconDatabase,
    IconFileSpreadsheet,
    IconFolder,
    IconLock,
    IconPlus,
    IconSearch,
    IconSettings,
    IconSql,
    IconTable,
    type Icon,
} from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { DataSourceIcon } from '../../components/common/DataSourceIcon';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { ItemDetailMarkdown } from '../../components/Explorer/ExploreTree/TableTree/ItemDetailPreview';
import dbtLogo from '../../components/ProjectConnection/ProjectConnectFlow/Assets/dbt.svg';
import { WarehouseTypeLabels } from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import useHealth from '../../hooks/health/useHealth';
import { useUpdateLiveSourceFields } from '../externalConnections/hooks/useLiveSourceFields';
import { AddDataModal } from '../externalSources/components/AddDataModal';
import { isSameDraft, toFieldChange, toFieldDraft } from './fieldDraft';
import { useLiveSourceActions } from './liveSources/liveSourceActions';
import {
    getExplore,
    getSource,
    searchResultId,
    sourceWarehouse,
    summaryOf,
    type Explore,
    type Field,
    type FieldKind,
    type Kind,
    type NodeRef,
    type Project,
    type SearchResult,
    type Source,
} from './model';
import classes from './shared.module.css';
import {
    type FieldDraft,
    type FieldFilter,
    type ProjectSearch,
    type ViewModel,
} from './useSemanticStudio';

dayjs.extend(relativeTime);

// ---------------------------------------------------------------------------
// Icons

const Logo: FC<{ src: string; size: number }> = ({ src, size }) => (
    <Image src={src} alt="" w={size} h={size} className={classes.logo} />
);

const WarehouseLogo: FC<{ type: string; size: number }> = ({ type, size }) => {
    const item = WarehouseTypeLabels.find(
        ({ key }) => key === (type as WarehouseTypes),
    );
    return item?.iconType === 'image' ? (
        <Logo src={item.image} size={size} />
    ) : (
        <MantineIcon icon={IconDatabase} size={size} color="dimmed" />
    );
};

const KIND_ICONS: Record<Kind, Icon> = {
    modelled: IconDatabase,
    sqlViews: IconSql,
    files: IconFileSpreadsheet,
    live: IconBroadcast,
};

const SourceLogo: FC<{ source: Source; size?: number }> = ({
    source,
    size = 16,
}) => {
    switch (source.type) {
        case 'dbt':
            return <Logo src={dbtLogo} size={size} />;
        case 'sqlView':
            return <MantineIcon icon={IconSql} size={size} color="dimmed" />;
        case 'csv':
        case 'sheets':
            return (
                <DataSourceIcon source={{ type: source.type }} size={size} />
            );
        case 'live':
            return (
                <DataSourceIcon
                    source={{ type: 'live', integration: source.integration }}
                    size={size}
                />
            );
        default:
            return null;
    }
};

const KindIcon: FC<{ kind: Kind; size?: number }> = ({ kind, size = 16 }) => (
    <MantineIcon icon={KIND_ICONS[kind]} size={size} color="dimmed" />
);

const isDimensionType = (type: string): type is DimensionType =>
    Object.values<string>(DimensionType).includes(type);
const isMetricType = (type: string): type is MetricType =>
    Object.values<string>(MetricType).includes(type);

/** The explorer's field icon, from a field kind and type. */
const KindTypeIcon: FC<{
    fieldKind: FieldKind;
    type: string;
    name: string;
    size?: 'md' | 'lg';
}> = ({ fieldKind, type, name, size = 'md' }) => (
    <FieldIcon
        size={size}
        item={
            {
                fieldType:
                    fieldKind === 'metric'
                        ? FieldType.METRIC
                        : FieldType.DIMENSION,
                type:
                    fieldKind === 'metric'
                        ? isMetricType(type)
                            ? type
                            : MetricType.NUMBER
                        : isDimensionType(type)
                          ? type
                          : DimensionType.STRING,
                name,
                label: name,
            } as LightdashField
        }
    />
);

const FieldTypeIcon: FC<{ field: Field; size?: 'md' | 'lg' }> = ({
    field,
    size = 'md',
}) => (
    <KindTypeIcon
        fieldKind={field.fieldKind}
        type={field.type}
        name={field.name}
        size={size}
    />
);

/** The icon for any node: the source's own logo wins over generic icons. */
export const NodeIcon: FC<{
    project: Project;
    nodeRef: NodeRef;
    size?: number;
    /** Search results know a field's kind before its explore loads. */
    fieldKind?: FieldKind;
}> = ({ project, nodeRef, size = 16, fieldKind = 'dimension' }) => {
    switch (nodeRef.type) {
        case 'kind':
            return <KindIcon kind={nodeRef.kind} size={size} />;
        case 'source': {
            // Under Warehouse, the semantic layer is the warehouse it runs on.
            const source = getSource(project, nodeRef.sourceId);
            const warehouse =
                source.kind === 'modelled'
                    ? sourceWarehouse(project, source)
                    : undefined;
            return warehouse ? (
                <WarehouseLogo type={warehouse.type} size={size} />
            ) : (
                <SourceLogo source={source} size={size} />
            );
        }
        case 'group':
            return <MantineIcon icon={IconFolder} size={size} color="dimmed" />;
        case 'explore': {
            const explore = getExplore(project, nodeRef.exploreId);
            const source = getSource(project, explore.sourceId);
            return source.type === 'dbt' ? (
                <MantineIcon icon={IconTable} size={size} color="dimmed" />
            ) : (
                <SourceLogo source={source} size={size} />
            );
        }
        case 'field':
            return (
                <KindTypeIcon
                    fieldKind={fieldKind}
                    type={fieldKind === 'metric' ? 'number' : 'string'}
                    name={nodeRef.fieldId}
                />
            );
        default:
            return null;
    }
};

const FIELD_ROW_HEIGHT = 36;

const ADD_OPTIONS: {
    key: string;
    kind: Kind;
    label: string;
    description: string;
    icon: ReactNode;
    /**
     * The existing setup flow. Without one, the option opens its add dialog
     * right here.
     */
    path?: string;
    /** The flow lives in project settings, which not everyone can open. */
    inSettings?: boolean;
}[] = [
    {
        key: 'dbt',
        kind: 'modelled',
        label: 'Warehouse',
        description: 'Connect a dbt project',
        path: '/generalSettings/projectManagement/:projectUuid/settings',
        inSettings: true,
        icon: <KindIcon kind="modelled" size={18} />,
    },
    {
        key: 'sql',
        kind: 'sqlViews',
        label: 'Virtual view',
        description: 'Save a SQL query as a table',
        path: '/projects/:projectUuid/sql-runner',
        icon: <KindIcon kind="sqlViews" size={18} />,
    },
    {
        key: 'file',
        kind: 'files',
        label: 'External source',
        description: 'Upload a file or spreadsheet',
        icon: <KindIcon kind="files" size={18} />,
    },
    {
        key: 'live',
        kind: 'live',
        label: 'Live data source',
        description: 'Query an integration live',
        icon: <KindIcon kind="live" size={18} />,
    },
];

type AddOption = (typeof ADD_OPTIONS)[number];

/**
 * What a person can add: one warehouse per project, only kinds they manage,
 * and only through flows they can open. Files and live data sources are
 * added in place, so the hook also owns the Add data dialog.
 */
const useAddSource = (view: ViewModel, kind?: Kind) => {
    const { data: health } = useHealth();
    const liveSources = useLiveSourceActions();
    const [isAddingData, setIsAddingData] = useState(false);
    const isAvailable = (option: AddOption) => {
        switch (option.key) {
            case 'file':
                return health?.externalSources.engineAvailable === true;
            case 'live':
                return liveSources !== null;
            default:
                return true;
        }
    };
    const hasWarehouse = view.project.sources.some(
        (source) => source.kind === 'modelled',
    );
    const allowed = ADD_OPTIONS.filter(
        (option) =>
            (!kind || option.kind === kind) &&
            (!option.inSettings || view.canOpenSettings) &&
            isAvailable(option) &&
            view.canManage(option.kind),
    );
    // One warehouse per project: once it has one, the menu still lists it,
    // greyed out, so people see where their dbt project comes from.
    const options = allowed.filter(
        (option) => option.key !== 'dbt' || !hasWarehouse,
    );
    const menuOptions = allowed.map((option) => ({
        option,
        disabled: option.key === 'dbt' && hasWarehouse,
    }));
    const pathOf = (option: AddOption) =>
        option.path ? addPath(view, option.path) : null;
    const addInPlace = (option: AddOption) =>
        option.key === 'live' ? liveSources?.add() : setIsAddingData(true);
    const dialog = (
        <AddDataModal
            projectUuid={view.project.id}
            opened={isAddingData}
            onClose={() => setIsAddingData(false)}
            onCreated={(exploreName) =>
                view.select({ type: 'explore', exploreId: exploreName })
            }
        />
    );
    return { options, menuOptions, pathOf, addInPlace, dialog };
};

const addPath = (view: ViewModel, path: string) =>
    path.replace(':projectUuid', view.project.id);

export const AddSourceButton: FC<{
    view: ViewModel;
    kind?: Kind;
}> = ({ view, kind }) => {
    const { options, menuOptions, pathOf, addInPlace, dialog } = useAddSource(
        view,
        kind,
    );
    if (options.length === 0) return null;
    return (
        <>
            <Menu position="bottom-start">
                <Menu.Target>
                    <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        className={classes.pressable}
                        leftSection={<MantineIcon icon={IconPlus} size={14} />}
                    >
                        Add
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    {menuOptions.map(({ option, disabled }) => {
                        const path = disabled ? null : pathOf(option);
                        const content = (
                            <Text fz="sm" fw={500}>
                                {option.label}
                            </Text>
                        );
                        return path ? (
                            <Menu.Item
                                key={option.key}
                                component={Link}
                                to={path}
                                leftSection={option.icon}
                            >
                                {content}
                            </Menu.Item>
                        ) : (
                            <Menu.Item
                                key={option.key}
                                disabled={disabled}
                                onClick={() => addInPlace(option)}
                                leftSection={option.icon}
                            >
                                {content}
                            </Menu.Item>
                        );
                    })}
                </Menu.Dropdown>
            </Menu>
            {dialog}
        </>
    );
};

/** Opens the source's existing settings page; labelled, never a bare gear. */
export const SettingsLink: FC<{
    view: ViewModel;
    source: Source;
    variant?: 'button' | 'subtle';
}> = ({ view, source, variant = 'button' }) => {
    if (
        !source.settingsPath ||
        !view.canOpenSettings ||
        !view.canManage(source.kind)
    )
        return null;
    return (
        <Button
            component={Link}
            to={addPath(view, source.settingsPath)}
            size="xs"
            variant={variant === 'subtle' ? 'subtle' : 'default'}
            color={variant === 'subtle' ? 'gray' : undefined}
            className={classes.pressable}
            leftSection={<MantineIcon icon={IconSettings} size={14} />}
            onClick={(event: MouseEvent) => event.stopPropagation()}
        >
            Settings
        </Button>
    );
};

// ---------------------------------------------------------------------------
// Field table (virtualised: PostHog alone has 2,310 fields)

/** "In use" in the row: just a check, shown when the field is in use.
 * It's state, not a control; you change it in the field's details. */
const InUseMark: FC<{ field: Field }> = ({ field }) => (
    // A native title: a tooltip per row is the costliest part of a row.
    <Box
        className={classes.inUseMark}
        title={field.inUse ? 'In use' : 'Not in use'}
        aria-label={field.inUse ? 'In use' : 'Not in use'}
    >
        {field.inUse ? <MantineIcon icon={IconCheck} size={14} /> : null}
    </Box>
);

const DIVIDER_HEIGHT = 36;

type FieldListRow =
    | { type: 'divider'; label: string; count: number }
    | { type: 'field'; field: Field; index: number };

/** Each group, dimensions then metrics, opens with its own header row. */
const toRows = (fields: Field[]): FieldListRow[] => {
    const metricCount = fields.filter(
        ({ fieldKind }) => fieldKind === 'metric',
    ).length;
    const dimensionCount = fields.length - metricCount;
    return fields.flatMap((field, index): FieldListRow[] => {
        const row: FieldListRow = { type: 'field', field, index };
        const isMetric = field.fieldKind === 'metric';
        const previous = fields[index - 1];
        const startsGroup =
            !previous || (isMetric && previous.fieldKind !== 'metric');
        if (!startsGroup) return [row];
        return [
            isMetric
                ? { type: 'divider', label: 'Metrics', count: metricCount }
                : {
                      type: 'divider',
                      label: 'Dimensions',
                      count: dimensionCount,
                  },
            row,
        ];
    });
};

/**
 * One field in the table. Memoised: typing in the field search re-renders the
 * table, and rows that didn't change skip it.
 */
const FieldRow = memo<{
    field: Field;
    index: number;
    top: number;
    selected: boolean;
    tabStop: boolean;
    showUsage: boolean;
    /** From a joined table, not the explore's own. */
    joined: boolean;
    unsaved: boolean;
    onOpen: (field: Field) => void;
}>(
    ({
        field,
        index,
        top,
        selected,
        tabStop,
        showUsage,
        joined,
        unsaved,
        onOpen,
    }) => {
        const summary = summaryOf(field.description);
        return (
            <Box className={classes.fieldItem} top={top}>
                <Box
                    className={classes.fieldRow}
                    data-selected={selected}
                    data-plain={!showUsage}
                    data-off={!field.inUse}
                    data-field-index={index}
                    data-field-id={field.id}
                    role="row"
                    aria-selected={selected}
                    tabIndex={tabStop ? 0 : -1}
                    onClick={() => onOpen(field)}
                >
                    {showUsage ? (
                        <Box className={classes.fieldInUse}>
                            <InUseMark field={field} />
                        </Box>
                    ) : null}
                    <Group gap={8} wrap="nowrap" className={classes.fieldName}>
                        <Box flex="none" display="flex">
                            <FieldTypeIcon field={field} />
                        </Box>
                        <Text
                            truncate
                            className={classes.fieldLabel}
                            title={field.label}
                        >
                            {field.label}
                        </Text>
                        {joined ? (
                            <Text truncate className={classes.fieldTable}>
                                {field.table}
                            </Text>
                        ) : null}
                        {unsaved ? (
                            <Text className={classes.fieldUnsaved}>
                                Unsaved
                            </Text>
                        ) : null}
                        {field.visibleTo ? (
                            <Tooltip
                                label={`Only people with ${field.visibleTo}`}
                                openDelay={300}
                            >
                                <Box flex="none" display="flex">
                                    <MantineIcon
                                        icon={IconLock}
                                        size={12}
                                        color="dimmed"
                                    />
                                </Box>
                            </Tooltip>
                        ) : null}
                    </Group>
                    <Text
                        truncate
                        className={classes.fieldDescription}
                        title={summary || undefined}
                    >
                        {summary}
                    </Text>
                    {showUsage ? (
                        <Text
                            className={`${classes.fieldCount} ${classes.usedCell}`}
                        >
                            {field.chartUsage
                                ? field.chartUsage.toLocaleString()
                                : ''}
                        </Text>
                    ) : null}
                    <Box className={classes.fieldChevron}>
                        <MantineIcon icon={IconChevronRight} size={14} />
                    </Box>
                </Box>
            </Box>
        );
    },
);

export const FieldList: FC<{
    view: ViewModel;
    explore: Explore;
    fields: Field[];
    /** Live data sources: the In use check and chart counts. */
    showUsage: boolean;
    /** The field whose details are open, from the URL. */
    openFieldId: string | null;
    /** Click or Enter opens a field's details; arrows move between rows. */
    onOpen: (field: Field) => void;
    toolbar?: ReactNode;
}> = ({ view, explore, fields, showUsage, openFieldId, onOpen, toolbar }) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const rows = useMemo(() => toRows(fields), [fields]);
    const rowIndexByField = useMemo(
        () =>
            new Map(
                rows.flatMap((row, rowIndex) =>
                    row.type === 'field'
                        ? [[row.field.id, rowIndex] as const]
                        : [],
                ),
            ),
        [rows],
    );
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) =>
            rows[index].type === 'divider' ? DIVIDER_HEIGHT : FIELD_ROW_HEIGHT,
        overscan: 12,
    });
    const [activeFieldId, setActiveFieldId] = useState(openFieldId);
    // Rows are memoised, so they get one stable handler; it reads the latest
    // onOpen when called.
    const onOpenRef = useRef(onOpen);
    useEffect(() => {
        onOpenRef.current = onOpen;
    });
    const openRow = useCallback((field: Field) => {
        setActiveFieldId(field.id);
        onOpenRef.current(field);
    }, []);
    const selectedIndex = fields.findIndex(({ id }) => id === activeFieldId);
    const tabStop = selectedIndex < 0 ? 0 : selectedIndex;
    // Arriving on an open field (a link, back, reload): show its row.
    useEffect(() => {
        const rowIndex = openFieldId
            ? rowIndexByField.get(openFieldId)
            : undefined;
        if (rowIndex === undefined) return;
        virtualizer.scrollToIndex(rowIndex, { align: 'center' });
        // Only on arrival, not on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const focusField = (index: number) => {
        const field = fields[index];
        if (!field) return;
        setActiveFieldId(field.id);
        const rowIndex = rowIndexByField.get(field.id);
        if (rowIndex !== undefined) virtualizer.scrollToIndex(rowIndex);
        // The row may only exist after the scroll renders it.
        requestAnimationFrame(() =>
            parentRef.current
                ?.querySelector<HTMLElement>(`[data-field-index="${index}"]`)
                ?.focus(),
        );
    };

    // Arrow keys move between rows, Enter opens one.
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (
            !(event.target instanceof HTMLElement) ||
            event.target.getAttribute('role') !== 'row'
        ) {
            return;
        }
        const current = selectedIndex < 0 ? -1 : selectedIndex;
        const next =
            event.key === 'ArrowDown'
                ? Math.min(current + 1, fields.length - 1)
                : event.key === 'ArrowUp'
                  ? Math.max(current - 1, 0)
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? fields.length - 1
                      : null;
        if (next !== null) {
            event.preventDefault();
            focusField(next);
            return;
        }
        const field = fields[current];
        if (event.key === 'Enter' && field) {
            event.preventDefault();
            onOpen(field);
        }
    };

    // From the search box, ArrowDown moves into the list.
    const handleTableKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (
            event.key === 'ArrowDown' &&
            event.target instanceof HTMLElement &&
            event.target.closest('[data-field-search]') &&
            fields.length > 0
        ) {
            event.preventDefault();
            focusField(selectedIndex < 0 ? 0 : selectedIndex);
        }
    };

    return (
        <Box className={classes.table} onKeyDown={handleTableKeyDown}>
            {toolbar}
            <Box
                className={classes.fieldHeader}
                data-plain={!showUsage}
                role="presentation"
            >
                {showUsage ? <span /> : null}
                <span>Field</span>
                <span>Description</span>
                {showUsage ? (
                    <span className={classes.usedCell}>Used in</span>
                ) : null}
                <span />
            </Box>
            {fields.length === 0 ? (
                <Stack gap={2} align="center" py="xl">
                    <Text fz="sm" fw={500}>
                        No fields match
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Clear the search or show all fields.
                    </Text>
                </Stack>
            ) : (
                <Box
                    ref={parentRef}
                    className={classes.fieldList}
                    role="grid"
                    aria-label={`${explore.label} fields`}
                    onKeyDown={handleKeyDown}
                >
                    <Box
                        className={classes.fieldListInner}
                        h={virtualizer.getTotalSize()}
                    >
                        {virtualizer.getVirtualItems().map((item) => {
                            const row = rows[item.index];
                            if (row.type === 'divider') {
                                return (
                                    <Box
                                        key={`divider:${row.label}`}
                                        className={classes.fieldDivider}
                                        top={item.start}
                                        role="presentation"
                                    >
                                        <span>{row.label}</span>
                                        <span
                                            className={
                                                classes.fieldDividerCount
                                            }
                                        >
                                            {row.count.toLocaleString()}
                                        </span>
                                    </Box>
                                );
                            }
                            const { field, index } = row;
                            return (
                                <FieldRow
                                    key={field.id}
                                    field={field}
                                    index={index}
                                    top={item.start}
                                    selected={field.id === activeFieldId}
                                    tabStop={index === tabStop}
                                    showUsage={showUsage}
                                    joined={field.table !== explore.name}
                                    unsaved={!!view.getDraft(explore, field)}
                                    onOpen={openRow}
                                />
                            );
                        })}
                    </Box>
                </Box>
            )}
        </Box>
    );
};

const FILTER_LABELS: Record<FieldFilter, string> = {
    all: 'All fields',
    inUse: 'In use',
    notInUse: 'Not in use',
    noDescription: 'Missing description',
};

/** The table's top edge: search and one filter menu. */
export const FieldListToolbar: FC<{
    filter: FieldFilter;
    onFilterChange: (filter: FieldFilter) => void;
    query: string;
    onQueryChange: (query: string) => void;
    showInternal: boolean;
    onShowInternalChange: (value: boolean) => void;
    hasInternal: boolean;
    /** In use filters only where fields can be turned off. */
    showInUse: boolean;
}> = ({
    filter,
    onFilterChange,
    query,
    onQueryChange,
    showInternal,
    onShowInternalChange,
    hasInternal,
    showInUse,
}) => (
    <Group className={classes.tableToolbar} gap="xs" wrap="nowrap">
        <TextInput
            variant="unstyled"
            size="xs"
            flex={1}
            placeholder="Search fields"
            data-field-search
            leftSection={<MantineIcon icon={IconSearch} size={14} />}
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && query) onQueryChange('');
            }}
        />
        <Menu position="bottom-end" width={200}>
            <Menu.Target>
                <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    className={classes.pressable}
                    rightSection={
                        <MantineIcon icon={IconChevronDown} size={12} />
                    }
                >
                    {FILTER_LABELS[filter]}
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                {(Object.keys(FILTER_LABELS) as FieldFilter[])
                    .filter(
                        (value) =>
                            showInUse ||
                            (value !== 'inUse' && value !== 'notInUse'),
                    )
                    .map((value) => (
                        <Menu.Item
                            key={value}
                            rightSection={
                                filter === value ? (
                                    <MantineIcon icon={IconCheck} size={14} />
                                ) : null
                            }
                            onClick={() => onFilterChange(value)}
                        >
                            {FILTER_LABELS[value]}
                        </Menu.Item>
                    ))}
                {hasInternal ? (
                    <>
                        <Menu.Divider />
                        <Menu.Item
                            closeMenuOnClick={false}
                            rightSection={
                                showInternal ? (
                                    <MantineIcon icon={IconCheck} size={14} />
                                ) : null
                            }
                            onClick={() => onShowInternalChange(!showInternal)}
                        >
                            Internal fields
                        </Menu.Item>
                    </>
                ) : null}
            </Menu.Dropdown>
        </Menu>
    </Group>
);

// ---------------------------------------------------------------------------
// Details: one modal for fields, explores and sources. What you can edit
// comes first, then a hairline, then everything else about it.

const PropertyRow: FC<{ term: string; children: ReactNode }> = ({
    term,
    children,
}) => (
    <>
        <Text className={classes.propertyTerm}>{term}</Text>
        <Box miw={0} className={classes.propertyValue}>
            {children}
        </Box>
    </>
);

/** A read-only value, on the same line as an editable one would be. */
const Value: FC<{ children: ReactNode; code?: boolean }> = ({
    children,
    code,
}) => (
    <Text className={classes.inlineStatic} data-code={code}>
        {children}
    </Text>
);

/** An editable value: a plain input, so it reads as editable at a glance. */
const EditableText: FC<{
    value: string;
    placeholder: string;
    readOnly: boolean;
    multiline?: boolean;
    autoFocus?: boolean;
    onChange: (value: string) => void;
}> = ({ value, placeholder, readOnly, multiline, autoFocus, onChange }) =>
    readOnly && multiline && value ? (
        <Box className={classes.inlineMarkdown}>
            <ItemDetailMarkdown source={value} />
        </Box>
    ) : readOnly ? (
        <Text className={classes.inlineStatic} data-empty={!value}>
            {value || placeholder}
        </Text>
    ) : multiline ? (
        <Textarea
            size="xs"
            autosize
            minRows={2}
            maxRows={8}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
        />
    ) : (
        <TextInput
            size="xs"
            placeholder={placeholder}
            value={value}
            data-autofocus={autoFocus ? true : undefined}
            onChange={(event) => onChange(event.currentTarget.value)}
        />
    );

const DetailModal: FC<{
    icon: ReactNode;
    title: string;
    subtitle: string;
    onClose: () => void;
    /** Editable properties; left out when nothing here can be edited. */
    editable?: ReactNode;
    /** Everything else about it, read only. */
    facts: ReactNode;
    /** Left: what saving does or why you can't. Right: the actions. */
    note?: ReactNode;
    actions: ReactNode;
    onSaveHotkey?: () => void;
    /** Nothing to type into: focus lands on the body, not the close button. */
    focusBody?: boolean;
}> = ({
    icon,
    title,
    subtitle,
    onClose,
    editable,
    facts,
    note,
    actions,
    onSaveHotkey,
    focusBody,
}) => (
    <Modal
        opened
        onClose={onClose}
        size={600}
        title={
            <Group gap={10} wrap="nowrap" miw={0}>
                <Box flex="none" display="flex">
                    {icon}
                </Box>
                <Box miw={0}>
                    <Text className={classes.modalTitle} truncate>
                        {title}
                    </Text>
                    <Text fz="xs" c="dimmed" truncate>
                        {subtitle}
                    </Text>
                </Box>
            </Group>
        }
        classNames={{ title: classes.modalTitleSlot }}
    >
        <Box
            className={classes.modalContent}
            tabIndex={focusBody ? -1 : undefined}
            data-autofocus={focusBody ? true : undefined}
            onKeyDown={
                onSaveHotkey
                    ? getHotkeyHandler([['mod+Enter', onSaveHotkey]])
                    : undefined
            }
        >
            <Box className={classes.detailList}>
                {editable}
                {editable ? <Box className={classes.detailDivider} /> : null}
                {facts}
            </Box>
            <Group
                className={classes.modalFooter}
                justify="space-between"
                gap="sm"
                wrap="nowrap"
            >
                <Box miw={0}>{note}</Box>
                <Group gap="xs" wrap="nowrap" flex="none">
                    {actions}
                </Group>
            </Group>
        </Box>
    </Modal>
);

const CloseButton: FC<{ onClose: () => void }> = ({ onClose }) => (
    <Button
        size="xs"
        variant="default"
        className={classes.pressable}
        onClick={onClose}
    >
        Close
    </Button>
);

export const FieldDetailModal: FC<{
    view: ViewModel;
    explore: Explore;
    field: Field;
    /** The explore's groups, offered when moving the field to another. */
    groups: string[];
    onClose: () => void;
}> = ({ view, explore, field, groups, onClose }) => {
    const source = getSource(view.project, explore.sourceId);
    const saved = toFieldDraft(field);
    // Drafts live in the view, so closing without saving keeps them.
    const draft = view.getDraft(explore, field) ?? saved;
    const isSaved = (next: FieldDraft) => isSameDraft(next, saved);
    const setDraft = (next: FieldDraft) =>
        view.setDraft(explore, field, isSaved(next) ? null : next);
    const canEdit = view.canEditFields(explore);
    const isLive = source.kind === 'live';
    const dirty = !isSaved(draft);
    const discard = () => view.setDraft(explore, field, null);
    const update = useUpdateLiveSourceFields({
        projectUuid: view.project.id,
        connectionUuid: source.connectionUuid ?? '',
    });
    const save = () => {
        update.mutate([toFieldChange(field.name, draft, saved)], {
            onSuccess: discard,
        });
    };
    const note =
        !canEdit && isLive ? (
            <Group gap={6} wrap="nowrap" miw={0}>
                <MantineIcon icon={IconLock} size={12} color="dimmed" />
                <Text fz="xs" c="dimmed" truncate>
                    Only project admins can edit live data source fields
                </Text>
            </Group>
        ) : null;

    return (
        <DetailModal
            icon={<FieldTypeIcon field={field} size="lg" />}
            title={field.label}
            subtitle={`${field.fieldKind === 'metric' ? 'Metric' : 'Dimension'} in ${explore.label}`}
            onClose={onClose}
            onSaveHotkey={canEdit && dirty ? save : undefined}
            focusBody={!canEdit}
            editable={
                <>
                    <PropertyRow term="Label">
                        <EditableText
                            autoFocus
                            value={draft.label}
                            placeholder="Label"
                            readOnly={!canEdit}
                            onChange={(label) => setDraft({ ...draft, label })}
                        />
                    </PropertyRow>
                    <PropertyRow term="Description">
                        <EditableText
                            multiline
                            value={draft.description}
                            placeholder={
                                canEdit ? 'Add a description' : 'No description'
                            }
                            readOnly={!canEdit}
                            onChange={(description) =>
                                setDraft({ ...draft, description })
                            }
                        />
                    </PropertyRow>
                    <PropertyRow term="AI hint">
                        <EditableText
                            multiline
                            value={draft.aiHint}
                            placeholder={
                                canEdit
                                    ? 'Tell AI agents when to use this field'
                                    : 'No AI hint'
                            }
                            readOnly={!canEdit}
                            onChange={(aiHint) =>
                                setDraft({ ...draft, aiHint })
                            }
                        />
                    </PropertyRow>
                    {isLive && canEdit ? (
                        <PropertyRow term="Group">
                            <Autocomplete
                                size="xs"
                                aria-label="Group"
                                placeholder="No group"
                                data={groups}
                                value={draft.group}
                                limit={50}
                                comboboxProps={{ withinPortal: true }}
                                onChange={(group) =>
                                    setDraft({ ...draft, group })
                                }
                            />
                        </PropertyRow>
                    ) : null}
                    {isLive ? (
                        <PropertyRow term="In use">
                            <Group className={classes.detailControl} gap={8}>
                                <Switch
                                    size="sm"
                                    aria-label={`${field.label} in use`}
                                    checked={draft.inUse}
                                    disabled={!canEdit || field.isRequired}
                                    onChange={(event) =>
                                        setDraft({
                                            ...draft,
                                            inUse: event.currentTarget.checked,
                                        })
                                    }
                                />
                                {field.isRequired ? (
                                    <Text fz="xs" c="dimmed">
                                        Every query needs it
                                    </Text>
                                ) : null}
                            </Group>
                        </PropertyRow>
                    ) : null}
                </>
            }
            facts={
                <>
                    <PropertyRow term="Type">
                        <Value>{field.type}</Value>
                    </PropertyRow>
                    <PropertyRow term={field.definition.label}>
                        <Value code>{field.definition.value}</Value>
                    </PropertyRow>
                    {field.table !== explore.name ? (
                        <PropertyRow term="Table">
                            <Value>{field.tableLabel}</Value>
                        </PropertyRow>
                    ) : null}
                    {field.group && !(isLive && canEdit) ? (
                        <PropertyRow term="Group">
                            <Value>{field.group}</Value>
                        </PropertyRow>
                    ) : null}
                    {field.visibleTo ? (
                        <PropertyRow term="Visible to">
                            <Value>People with {field.visibleTo}</Value>
                        </PropertyRow>
                    ) : null}
                    {field.chartUsage !== null ? (
                        <PropertyRow term="Used in">
                            <Value>
                                {field.chartUsage
                                    ? `${field.chartUsage.toLocaleString()} chart${field.chartUsage === 1 ? '' : 's'}`
                                    : 'No charts'}
                            </Value>
                        </PropertyRow>
                    ) : null}
                    {field.lastEdit ? (
                        <PropertyRow term="Last change">
                            <Value>
                                {field.lastEdit.by},{' '}
                                {dayjs(field.lastEdit.at).fromNow()}
                            </Value>
                        </PropertyRow>
                    ) : null}
                </>
            }
            note={note}
            actions={
                canEdit ? (
                    <>
                        {dirty ? (
                            <Button
                                size="xs"
                                variant="subtle"
                                color="gray"
                                className={classes.pressable}
                                disabled={update.isLoading}
                                onClick={discard}
                            >
                                Discard
                            </Button>
                        ) : null}
                        <Button
                            size="xs"
                            className={classes.pressable}
                            disabled={!dirty}
                            loading={update.isLoading}
                            onClick={save}
                        >
                            Save
                        </Button>
                    </>
                ) : (
                    <CloseButton onClose={onClose} />
                )
            }
        />
    );
};
// ---------------------------------------------------------------------------
// Search results: grouped, in tree order, with where each one lives

const RESULT_HEIGHT = 44;
const RESULT_SHORT_HEIGHT = 32;
const RESULT_HEADER_HEIGHT = 30;

type ResultRow =
    | { type: 'header'; label: string }
    | { type: 'result'; result: SearchResult; index: number };

/** The matched part of a label, in the text colour; the rest stays quiet. */
const Highlight: FC<{ text: string; query: string }> = ({ text, query }) => {
    const needle = query.trim().toLowerCase();
    const at = needle ? text.toLowerCase().indexOf(needle) : -1;
    if (at < 0) return <>{text}</>;
    const end = at + needle.length;
    return (
        <>
            {text.slice(0, at)}
            <span className={classes.match}>{text.slice(at, end)}</span>
            {text.slice(end)}
        </>
    );
};

/** One search result; memoised, so typing only redraws rows that change. */
const ResultRow = memo<{
    project: Project;
    result: SearchResult;
    index: number;
    top: number;
    height: number;
    active: boolean;
    selected: boolean;
    query: string;
    onOpen: (nodeRef: NodeRef) => void;
}>(
    ({
        project,
        result,
        index,
        top,
        height,
        active,
        selected,
        query,
        onOpen,
    }) => {
        return (
            <Box
                id={searchResultId(index)}
                role="option"
                aria-selected={active}
                className={classes.resultRow}
                data-active={active}
                data-selected={selected}
                top={top}
                h={height}
                onClick={() => onOpen(result.ref)}
            >
                <Box className={classes.resultIcon}>
                    <NodeIcon
                        project={project}
                        nodeRef={result.ref}
                        fieldKind={result.fieldKind}
                        size={14}
                    />
                </Box>
                <Box miw={0}>
                    <Text className={classes.resultLabel} truncate>
                        <Highlight text={result.label} query={query} />
                    </Text>
                    {/* The nearest two levels say where it is. */}
                    {result.path.length > 0 ? (
                        <Text className={classes.resultPath} truncate>
                            {result.path.slice(-2).join(' / ')}
                        </Text>
                    ) : null}
                </Box>
            </Box>
        );
    },
    // Each search pass builds new result objects; compare what is shown.
    (prev, next) =>
        prev.result.key === next.result.key &&
        prev.result.label === next.result.label &&
        prev.result.path.join('/') === next.result.path.join('/') &&
        prev.result.fieldKind === next.result.fieldKind &&
        prev.project === next.project &&
        prev.index === next.index &&
        prev.top === next.top &&
        prev.height === next.height &&
        prev.active === next.active &&
        prev.selected === next.selected &&
        prev.query === next.query &&
        prev.onOpen === next.onOpen,
);

export const SearchResultsList: FC<{
    view: ViewModel;
    search: ProjectSearch;
    /** The keyboard cursor, driven from the search input. */
    activeIndex: number;
    onOpen: (nodeRef: NodeRef) => void;
}> = ({ view, search, activeIndex, onOpen }) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const { results, total } = search.results;
    const rows = useMemo(
        () =>
            results.reduce<ResultRow[]>((acc, result, index) => {
                if (results[index - 1]?.group !== result.group) {
                    acc.push({ type: 'header', label: result.group });
                }
                acc.push({ type: 'result', result, index });
                return acc;
            }, []),
        [results],
    );
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => {
            const row = rows[index];
            if (row.type === 'header') return RESULT_HEADER_HEIGHT;
            return row.result.path.length > 0
                ? RESULT_HEIGHT
                : RESULT_SHORT_HEIGHT;
        },
        overscan: 10,
    });
    // Follow the keyboard cursor. Only when it moves: new results start at
    // the top anyway, and scrolling on every keystroke costs a render.
    const rowsRef = useRef(rows);
    useEffect(() => {
        rowsRef.current = rows;
    }, [rows]);
    useEffect(() => {
        const rowIndex = rowsRef.current.findIndex(
            (row) => row.type === 'result' && row.index === activeIndex,
        );
        if (rowIndex >= 0) virtualizer.scrollToIndex(rowIndex);
    }, [activeIndex, virtualizer]);

    if (results.length === 0) {
        return search.isSearchingFields ? (
            <Stack className={classes.searchEmpty} gap={4}>
                <Text fz="sm" c="dimmed">
                    Searching…
                </Text>
            </Stack>
        ) : (
            <Stack className={classes.searchEmpty} gap={4}>
                <Text fz="sm">No matches</Text>
                <Text fz="xs" c="dimmed">
                    Try a source, folder, explore or field name.
                </Text>
            </Stack>
        );
    }
    return (
        <Box
            ref={parentRef}
            className={classes.searchScroll}
            id="semantic-search-results"
            role="listbox"
            aria-label="Search results"
        >
            <Box
                className={classes.fieldListInner}
                h={virtualizer.getTotalSize()}
            >
                {virtualizer.getVirtualItems().map((item) => {
                    const row = rows[item.index];
                    if (row.type === 'header') {
                        return (
                            <Text
                                key={`header-${row.label}`}
                                className={classes.resultHeader}
                                top={item.start}
                                role="presentation"
                            >
                                {row.label}
                            </Text>
                        );
                    }
                    const { result, index } = row;
                    return (
                        <ResultRow
                            key={result.key}
                            project={view.project}
                            result={result}
                            index={index}
                            top={item.start}
                            height={item.size}
                            active={index === activeIndex}
                            selected={result.key === view.selectedKey}
                            query={search.query}
                            onOpen={onOpen}
                        />
                    );
                })}
            </Box>
            {total > results.length ? (
                <Text className={classes.resultMore}>
                    First {results.length} of {total.toLocaleString()}. Keep
                    typing to narrow it down.
                </Text>
            ) : null}
        </Box>
    );
};

// ---------------------------------------------------------------------------
// Empty project

export const EmptyProject: FC<{ view: ViewModel }> = ({ view }) => {
    const { options, pathOf, addInPlace, dialog } = useAddSource(view);
    return (
        <Paper variant="dotted" p="xl" maw={560} mx="auto" mt="xl">
            <Stack gap="md" align="center">
                <Title order={4}>No data sources yet</Title>
                <Text fz="sm" c="dimmed" ta="center">
                    Everything people can query shows up here: your dbt project,
                    virtual views, external sources and live data sources.
                </Text>
                {options.length > 0 ? (
                    <Stack gap="xs" w="100%">
                        {options.map((option) => (
                            <Paper key={option.key} p="sm">
                                <Group gap="sm" wrap="nowrap">
                                    {option.icon}
                                    <Box flex={1}>
                                        <Text fz="sm" fw={500}>
                                            {option.label}
                                        </Text>
                                        <Text fz="xs" c="dimmed">
                                            {option.description}
                                        </Text>
                                    </Box>
                                    {pathOf(option) ? (
                                        <Anchor
                                            fz="sm"
                                            component={Link}
                                            to={pathOf(option) ?? ''}
                                        >
                                            Set up
                                        </Anchor>
                                    ) : (
                                        <Anchor
                                            fz="sm"
                                            component="button"
                                            type="button"
                                            onClick={() => addInPlace(option)}
                                        >
                                            Set up
                                        </Anchor>
                                    )}
                                </Group>
                            </Paper>
                        ))}
                    </Stack>
                ) : (
                    <Text fz="sm" c="dimmed" ta="center">
                        Ask a project admin to add one.
                    </Text>
                )}
            </Stack>
            {dialog}
        </Paper>
    );
};
