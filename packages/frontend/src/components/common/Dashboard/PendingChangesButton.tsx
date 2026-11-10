import {
    assertUnreachable,
    getItemLabelWithoutTableName,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Popover,
    ScrollArea,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine/core';
import {
    IconArrowsMove,
    IconArrowsSort,
    IconChevronDown,
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
    selectDashboardParameterDefinitions,
    selectDashboardParameters,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardAllFilters,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import { selectAllFilterableFieldsMap } from '../../../features/dashboard/store/dashboardSourceSelectors';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
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

// Diff marks: green adds, red removes, grey for everything else
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

const nameOf = (change: PendingChange): string => {
    if (change.area === 'tab' && change.kind === 'reordered') {
        return 'Tab order';
    }
    if (change.kind === 'renamed' && change.detail !== null) {
        return `${change.detail} → ${change.label}`;
    }
    if (change.area === 'tile' && change.kind === 'moved') {
        return `${change.label} → ${change.detail ?? 'another tab'}`;
    }
    return change.label;
};

const ChangeRow: FC<{ change: PendingChange }> = ({ change }) => {
    const mark = markOf(change.kind);
    return (
        <Group gap="xs" wrap="nowrap">
            <ThemeIcon size={18} radius="sm" variant="light" color={mark.color}>
                <MantineIcon icon={mark.icon} size={12} strokeWidth={2.5} />
            </ThemeIcon>
            <TruncatedText
                maxWidth="100%"
                fz="xs"
                fw={500}
                flex={1}
                className={
                    change.kind === 'removed' ? classes.removed : undefined
                }
            >
                {nameOf(change)}
            </TruncatedText>
            <Text fz="xs" c="dimmed" flex="0 0 auto">
                {AREA_NAMES[change.area]}
            </Text>
        </Group>
    );
};

type Props = {
    /** Areas tracked by a changed flag only */
    settingsChanges: PendingChange[];
};

export const PendingChangesButton = memo<Props>(({ settingsChanges }) => {
    const dashboard = useDashboardContext((c) => c.dashboard);
    const tiles = useDashboardSelector(selectDashboardTiles);
    const tabs = useDashboardSelector(selectDashboardTabs);
    const filters = useDashboardAllFilters();
    const parameters = useDashboardSelector(selectDashboardParameters);
    const fieldsMap = useDashboardSelector(selectAllFilterableFieldsMap);
    const parameterDefinitions = useDashboardSelector(
        selectDashboardParameterDefinitions,
    );

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
                    filters,
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
        parameters,
        getFilterLabel,
        parameterDefinitions,
        settingsChanges,
    ]);

    if (changes.length === 0) {
        return (
            <Group gap={6} wrap="nowrap" px="xs">
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
            <Popover.Dropdown p="xs" w={300}>
                <Text fz="xs" fw={500} c="dimmed" mb="xs">
                    Unsaved changes
                </Text>
                <ScrollArea.Autosize mah={320} type="auto">
                    <Stack gap="xs">
                        {changes.map((change) => (
                            <ChangeRow
                                key={`${change.area}:${change.kind}:${change.id}`}
                                change={change}
                            />
                        ))}
                    </Stack>
                </ScrollArea.Autosize>
            </Popover.Dropdown>
        </Popover>
    );
});
PendingChangesButton.displayName = 'PendingChangesButton';
