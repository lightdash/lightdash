import {
    FilterType,
    getDashboardFilterableFieldKey,
    type DashboardFilterableField,
} from '@lightdash/common';
import {
    Checkbox,
    CloseButton,
    Group,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import {
    IconAbc,
    IconCalendar,
    IconChevronRight,
    IconHash,
    IconSearch,
    IconToggleLeft,
    IconVariable,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import {
    foldFieldGrains,
    getFieldDisplayLabel,
    matchesSearch,
} from './fieldGrains';
import {
    FIELD_KINDS,
    countPickableByKind,
    filterFieldsByKind,
    filterParametersByKind,
    groupFieldsByExplore,
    matchesParameterSearch,
    type FieldKind,
    type PickableParameter,
} from './fieldKinds';
import classes from './FieldPicker.module.css';

const MAX_SEARCH_RESULTS = 12;
const MAX_EXPLORE_FIELDS = 8;

const KIND_META = {
    [FilterType.DATE]: { label: 'Date', icon: IconCalendar },
    [FilterType.STRING]: { label: 'Text', icon: IconAbc },
    [FilterType.NUMBER]: { label: 'Number', icon: IconHash },
    [FilterType.BOOLEAN]: { label: 'True or false', icon: IconToggleLeft },
};

type Props = {
    fields: DashboardFilterableField[];
    getChartCount: (field: DashboardFilterableField) => number;
    chosen: DashboardFilterableField[];
    onToggle: (field: DashboardFilterableField) => void;
    parameters: PickableParameter[];
    chosenParameterKeys: string[];
    onToggleParameter: (key: string) => void;
    kind: FieldKind | null;
    onKindChange: (kind: FieldKind | null) => void;
    lockedKind?: FieldKind;
    mode: 'multi' | 'single';
};

const pluralizeCharts = (count: number) => (count === 1 ? 'chart' : 'charts');

export const FieldPicker: FC<Props> = ({
    fields,
    getChartCount,
    chosen,
    onToggle,
    parameters,
    chosenParameterKeys,
    onToggleParameter,
    kind,
    onKindChange,
    lockedKind,
    mode,
}) => {
    const [search, setSearch] = useState('');
    const [openTable, setOpenTable] = useState<string | null>(null);
    const chosenKeys = new Set(chosen.map(getDashboardFilterableFieldKey));
    const activeKind = lockedKind ?? kind;
    const explores = useMemo(
        () =>
            groupFieldsByExplore(
                filterFieldsByKind(fields, activeKind),
                getChartCount,
            ),
        [fields, activeKind, getChartCount],
    );
    const isSearching = search.trim() !== '';
    const matches = useMemo(
        () =>
            isSearching
                ? fields.filter((field) => matchesSearch(field, search))
                : [],
        [fields, search, isSearching],
    );
    const parameterMatches = useMemo(
        () =>
            isSearching
                ? parameters.filter((parameter) =>
                      matchesParameterSearch(parameter, search),
                  )
                : [],
        [parameters, search, isSearching],
    );
    const kindParameters = filterParametersByKind(parameters, activeKind);
    const chosenParameters = parameters.filter((parameter) =>
        chosenParameterKeys.includes(parameter.key),
    );
    const counts = countPickableByKind(
        isSearching ? matches : fields,
        isSearching ? parameterMatches : parameters,
    );
    const chipLabel = (field: DashboardFilterableField) =>
        getFieldDisplayLabel(field, fields);
    const searchGroups = useMemo(() => {
        let remaining = MAX_SEARCH_RESULTS;
        return groupFieldsByExplore(matches, getChartCount).flatMap(
            (explore) => {
                if (remaining <= 0) return [];
                const shown = explore.fields.slice(0, remaining);
                remaining -= shown.length;
                const seen = new Set<string>();
                const duplicateLabels = new Set<string>();
                explore.fields.forEach((field) => {
                    const label = getFieldDisplayLabel(field, fields);
                    if (seen.has(label)) duplicateLabels.add(label);
                    seen.add(label);
                });
                return [
                    {
                        table: explore.table,
                        label: explore.label,
                        matchCount: explore.fields.length,
                        fields: shown,
                        duplicateLabels,
                    },
                ];
            },
        );
    }, [matches, fields, getChartCount]);
    const kinds = lockedKind ? [lockedKind] : FIELD_KINDS;

    const renderFieldRow = (
        field: DashboardFilterableField,
        label: string,
        detail: string,
    ) => {
        const key = getDashboardFilterableFieldKey(field);
        return (
            <UnstyledButton
                key={key}
                className={classes.fieldRow}
                aria-label={label}
                aria-pressed={
                    mode === 'multi' ? chosenKeys.has(key) : undefined
                }
                onClick={() => onToggle(field)}
            >
                {mode === 'multi' && (
                    <Checkbox
                        size="xs"
                        checked={chosenKeys.has(key)}
                        readOnly
                        tabIndex={-1}
                        aria-hidden
                    />
                )}
                <FieldIcon item={field} size={14} aria-hidden />
                <Text fz="sm" truncate className={classes.rowText}>
                    {label}
                </Text>
                <Text fz="xs" c="dimmed" truncate>
                    {detail}
                </Text>
            </UnstyledButton>
        );
    };

    const renderParameterRow = (parameter: PickableParameter) => {
        const isChosen = chosenParameterKeys.includes(parameter.key);
        return (
            <UnstyledButton
                key={parameter.key}
                className={classes.fieldRow}
                aria-label={parameter.label}
                aria-pressed={mode === 'multi' ? isChosen : undefined}
                onClick={() => onToggleParameter(parameter.key)}
            >
                {mode === 'multi' && (
                    <Checkbox
                        size="xs"
                        checked={isChosen}
                        readOnly
                        tabIndex={-1}
                        aria-hidden
                    />
                )}
                <MantineIcon icon={IconVariable} color="dimmed" aria-hidden />
                <Text fz="sm" truncate className={classes.rowText}>
                    {parameter.label}
                </Text>
                <Text fz="xs" c="dimmed" truncate>
                    {parameter.chartCount}{' '}
                    {pluralizeCharts(parameter.chartCount)}
                </Text>
            </UnstyledButton>
        );
    };

    const renderParameterGroup = (items: PickableParameter[]) =>
        items.length > 0 && (
            <Stack gap={0}>
                <Group gap="xs" className={classes.groupHeader}>
                    <Text fz="xs" fw={600} className={classes.rowText}>
                        Parameters
                    </Text>
                </Group>
                <Stack gap={0} pl="md">
                    {items.map(renderParameterRow)}
                </Stack>
            </Stack>
        );

    return (
        <Stack gap="sm">
            <TextInput
                placeholder="Search fields"
                autoFocus
                aria-label="Search fields"
                leftSection={<MantineIcon icon={IconSearch} />}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
            />
            {isSearching ? (
                <Stack gap={0}>
                    {matches.length === 0 && parameterMatches.length === 0 && (
                        <Text fz="xs" c="dimmed" px="xs">
                            No fields match
                        </Text>
                    )}
                    {renderParameterGroup(parameterMatches)}
                    {searchGroups.map((group) => (
                        <Stack key={group.table} gap={0}>
                            <Group
                                gap="xs"
                                className={classes.groupHeader}
                                wrap="nowrap"
                            >
                                <Text
                                    fz="sm"
                                    fw={600}
                                    truncate
                                    className={classes.rowText}
                                >
                                    {group.label}
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    {group.matchCount}{' '}
                                    {group.matchCount === 1
                                        ? 'match'
                                        : 'matches'}
                                </Text>
                            </Group>
                            <Stack gap={0} pl="md">
                                {group.fields.map((field) =>
                                    renderFieldRow(
                                        field,
                                        chipLabel(field),
                                        `${group.duplicateLabels.has(chipLabel(field)) ? `${field.label} · ` : ''}${getChartCount(field)} ${pluralizeCharts(getChartCount(field))}`,
                                    ),
                                )}
                            </Stack>
                        </Stack>
                    ))}
                    {matches.length > MAX_SEARCH_RESULTS && (
                        <Text fz="xs" c="dimmed" px="xs">
                            {matches.length - MAX_SEARCH_RESULTS} more fields.
                            Keep typing
                        </Text>
                    )}
                </Stack>
            ) : (
                <>
                    {mode === 'multi' &&
                        (chosen.length > 0 || chosenParameters.length > 0) && (
                            <Group gap="xs">
                                <Text fz="xs" c="dimmed">
                                    Chosen
                                </Text>
                                {chosenParameters.map((parameter) => (
                                    <Group
                                        key={parameter.key}
                                        gap={2}
                                        className={classes.chip}
                                    >
                                        <Text fz="xs">{parameter.label}</Text>
                                        <CloseButton
                                            size="xs"
                                            aria-label={`Remove ${parameter.label}`}
                                            onClick={() =>
                                                onToggleParameter(parameter.key)
                                            }
                                        />
                                    </Group>
                                ))}
                                {chosen.map((field) => (
                                    <Group
                                        key={getDashboardFilterableFieldKey(
                                            field,
                                        )}
                                        gap={2}
                                        className={classes.chip}
                                    >
                                        <Text fz="xs">{chipLabel(field)}</Text>
                                        <CloseButton
                                            size="xs"
                                            aria-label={`Remove ${chipLabel(field)}`}
                                            onClick={() => onToggle(field)}
                                        />
                                    </Group>
                                ))}
                            </Group>
                        )}
                    <SimpleGrid cols={lockedKind ? 1 : 2} spacing="xs">
                        {kinds.map((item) => {
                            const meta = KIND_META[item];
                            const selected = activeKind === item;
                            return (
                                <UnstyledButton
                                    key={item}
                                    className={`${classes.kindTile} ${selected ? classes.kindTileSelected : ''}`}
                                    aria-pressed={selected}
                                    disabled={lockedKind !== undefined}
                                    onClick={() =>
                                        onKindChange(selected ? null : item)
                                    }
                                >
                                    <MantineIcon icon={meta.icon} />
                                    <Text fz="sm">{meta.label}</Text>
                                    <Text fz="xs" c="dimmed">
                                        {counts[item]}
                                    </Text>
                                </UnstyledButton>
                            );
                        })}
                    </SimpleGrid>
                    {renderParameterGroup(kindParameters)}
                    <Stack gap={0}>
                        {explores.length === 0 &&
                            kindParameters.length === 0 && (
                                <Text fz="xs" c="dimmed" px="xs">
                                    No fields to add
                                </Text>
                            )}
                        {explores.map((explore) => {
                            const isOpen = openTable === explore.table;
                            const rows = foldFieldGrains(explore.fields);
                            return (
                                <Stack key={explore.table} gap={0}>
                                    <UnstyledButton
                                        className={classes.exploreRow}
                                        aria-expanded={isOpen}
                                        onClick={() =>
                                            setOpenTable(
                                                isOpen ? '' : explore.table,
                                            )
                                        }
                                    >
                                        <MantineIcon
                                            icon={IconChevronRight}
                                            className={`${classes.chevron} ${isOpen ? classes.chevronOpen : ''}`}
                                        />
                                        <Text
                                            fz="sm"
                                            fw={600}
                                            truncate
                                            className={classes.rowText}
                                        >
                                            {explore.label}
                                        </Text>
                                        <Text fz="xs" c="dimmed">
                                            {explore.chartCount}{' '}
                                            {pluralizeCharts(
                                                explore.chartCount,
                                            )}
                                        </Text>
                                    </UnstyledButton>
                                    {isOpen && (
                                        <Stack gap={0} pl="md">
                                            {rows
                                                .slice(0, MAX_EXPLORE_FIELDS)
                                                .map((row) =>
                                                    renderFieldRow(
                                                        row.field,
                                                        row.label,
                                                        `${getChartCount(row.field)} ${pluralizeCharts(getChartCount(row.field))}`,
                                                    ),
                                                )}
                                            {rows.length >
                                                MAX_EXPLORE_FIELDS && (
                                                <Text
                                                    fz="xs"
                                                    c="dimmed"
                                                    px="xs"
                                                >
                                                    {rows.length -
                                                        MAX_EXPLORE_FIELDS}{' '}
                                                    more. Type to search
                                                </Text>
                                            )}
                                        </Stack>
                                    )}
                                </Stack>
                            );
                        })}
                    </Stack>
                </>
            )}
        </Stack>
    );
};
