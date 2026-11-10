import {
    FeatureFlags,
    assertUnreachable,
    getItemLabelWithoutTableName,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Popover,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine/core';
import {
    IconArrowsMove,
    IconArrowsSort,
    IconChevronDown,
    IconEye,
    IconEyeOff,
    IconMinus,
    IconPencil,
    IconPlus,
    type Icon,
} from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import {
    getPendingChanges,
    type PendingChange,
    type PendingChangeArea,
    type PendingChangeKind,
} from '../../../features/dashboard/pendingChanges/getPendingChanges';
import {
    selectAllFilterableFieldsMap,
    selectDashboard,
    selectDashboardParameterDefinitions,
    selectDashboardParameters,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardAllFilters,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import { getDimensionFiltersToSave } from '../../../features/dashboardFilters/FilterConfiguration/utils';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../MantineIcon';
import TruncatedText from '../TruncatedText';
import classes from './PendingChangesButton.module.css';

const AREA_NAMES: Record<PendingChangeArea, string> = {
    layout: 'Layout',
    tile: 'Tile',
    tab: 'Tab',
    filter: 'Filter',
    parameter: 'Parameter',
    setting: 'Setting',
};

const markOf = (kind: PendingChangeKind): { icon: Icon; color: string } => {
    switch (kind) {
        case 'added':
            return { icon: IconPlus, color: 'green' };
        case 'removed':
            return { icon: IconMinus, color: 'red' };
        case 'moved':
            return { icon: IconArrowsMove, color: 'gray' };
        case 'renamed':
        case 'edited':
            return { icon: IconPencil, color: 'gray' };
        case 'reordered':
            return { icon: IconArrowsSort, color: 'gray' };
        case 'hidden':
            return { icon: IconEyeOff, color: 'gray' };
        case 'shown':
            return { icon: IconEye, color: 'gray' };
        default:
            return assertUnreachable(kind, 'Unknown change kind');
    }
};

// Additions first, then removals, then everything else, like a diff summary
const KIND_ORDER: PendingChangeKind[] = ['added', 'removed'];
const rankOf = (kind: PendingChangeKind) => {
    const index = KIND_ORDER.indexOf(kind);
    return index === -1 ? KIND_ORDER.length : index;
};

const KIND_VERBS: Record<PendingChangeKind, string> = {
    added: 'added',
    removed: 'removed',
    moved: 'moved',
    renamed: 'renamed',
    edited: 'changed',
    reordered: 'reordered',
    hidden: 'hidden',
    shown: 'shown',
};

// A reorder row already names what was reordered
const tagOf = ({ area, kind }: PendingChange) =>
    kind === 'reordered'
        ? 'Reordered'
        : `${AREA_NAMES[area]} ${KIND_VERBS[kind]}`;

const ChangeRow: FC<{ change: PendingChange }> = ({ change }) => {
    const mark = markOf(change.kind);
    return (
        <Group gap="xs" wrap="nowrap">
            <ThemeIcon size="sm" variant="light" color={mark.color}>
                <MantineIcon icon={mark.icon} size={14} />
            </ThemeIcon>
            <TruncatedText maxWidth="100%" fz="xs" fw={500} flex={1} miw={0}>
                {change.label}
            </TruncatedText>
            <Text fz="xs" c="dimmed" flex="0 0 auto">
                {tagOf(change)}
            </Text>
        </Group>
    );
};

type Props = {
    /** Areas tracked by a changed flag only */
    settingsChanges: PendingChange[];
};

export const PendingChangesButton = memo<Props>(({ settingsChanges }) => {
    const dashboard = useDashboardSelector(selectDashboard);
    const tiles = useDashboardSelector(selectDashboardTiles);
    const tabs = useDashboardSelector(selectDashboardTabs);
    const filters = useDashboardAllFilters();
    const parameters = useDashboardSelector(selectDashboardParameters);
    const fieldsMap = useDashboardSelector(selectAllFilterableFieldsMap);
    const parameterDefinitions = useDashboardSelector(
        selectDashboardParameterDefinitions,
    );
    const { data: dashboardControlsFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardControls,
    );
    const keepsRequiredDefaults = dashboardControlsFlag?.enabled === true;

    const getFilterLabel = useCallback(
        (rule: DashboardFilterRule) => {
            if (rule.label) return rule.label;
            const field = fieldsMap[rule.target.fieldId];
            return field === undefined
                ? rule.target.fieldId
                : getItemLabelWithoutTableName(field);
        },
        [fieldsMap],
    );

    const changes = useMemo(() => {
        if (dashboard === undefined) return [];
        return [
            ...getPendingChanges(
                {
                    tiles: dashboard.tiles,
                    tabs: dashboard.tabs,
                    filters: dashboard.filters,
                    parameters: dashboard.parameters ?? {},
                },
                {
                    tiles: tiles ?? dashboard.tiles,
                    tabs,
                    filters: {
                        ...filters,
                        dimensions: getDimensionFiltersToSave(
                            filters.dimensions,
                            keepsRequiredDefaults,
                        ),
                    },
                    parameters,
                },
                {
                    getFilterLabel,
                    getParameterLabel: (key) =>
                        parameterDefinitions[key]?.label ?? key,
                },
            ),
            ...settingsChanges,
        ].toSorted((a, b) => rankOf(a.kind) - rankOf(b.kind));
    }, [
        dashboard,
        tiles,
        tabs,
        filters,
        keepsRequiredDefaults,
        parameters,
        getFilterLabel,
        parameterDefinitions,
        settingsChanges,
    ]);

    if (changes.length === 0) {
        return (
            <Group gap="xs" wrap="nowrap" px="xs">
                <Box className={classes.dot} />
                <Text fz="xs" c="dimmed">
                    No unsaved changes
                </Text>
            </Group>
        );
    }

    return (
        <Popover position="bottom-end" withinPortal>
            <Popover.Target>
                <Button
                    variant="light"
                    size="xs"
                    leftSection={<Box className={classes.dot} data-unsaved />}
                    rightSection={
                        <MantineIcon icon={IconChevronDown} size={14} />
                    }
                >
                    {changes.length === 1
                        ? '1 change'
                        : `${changes.length} changes`}
                </Button>
            </Popover.Target>
            <Popover.Dropdown p="xs" w={360}>
                <Text fz="xs" fw={500} c="dimmed" mb="xs">
                    Unsaved changes
                </Text>
                <Stack gap="xs" className={classes.list}>
                    {changes.map((change) => (
                        <ChangeRow
                            key={`${change.area}:${change.kind}:${change.id}`}
                            change={change}
                        />
                    ))}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
});
PendingChangesButton.displayName = 'PendingChangesButton';
