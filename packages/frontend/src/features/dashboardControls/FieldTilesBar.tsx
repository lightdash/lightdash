import { Button, Divider, Group, Paper, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { createPortal } from 'react-dom';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { joinLabels, pluralizeTiles } from './fieldLabels';
import classes from './FieldTilesBar.module.css';
import { getFilterFields, type FieldScope } from './peers';
import { useControlsSidebar } from './useControlsSidebar';
import { useFieldTileActions, type FieldTiles } from './useFieldTileActions';
import { usePortalTargets } from './usePortalTargets';

const GRID_KEY = 'grid';
const GRID_SELECTOR = '.react-grid-layout';
const TAB_PANEL_SELECTOR = '[data-tab-uuid]';

// The grid of a tab panel, or the one grid of a dashboard without tabs
const getGridSelector = (key: string) =>
    key === GRID_KEY
        ? GRID_SELECTOR
        : `[data-tab-uuid="${key}"] ${GRID_SELECTOR}`;

// The element the active tab's tile grid sits in: the bar goes after the grid
const useGridContainer = (
    activeTabUuid: string | undefined,
    isEnabled: boolean,
): Element | null => {
    const keys = useMemo(
        () =>
            activeTabUuid === undefined
                ? [GRID_KEY]
                : [activeTabUuid, GRID_KEY],
        [activeTabUuid],
    );
    const targets = usePortalTargets(keys, getGridSelector, isEnabled, false);
    const tabGrid =
        activeTabUuid === undefined ? undefined : targets[activeTabUuid];
    const anyGrid = targets[GRID_KEY];
    // Never another tab's grid while the active panel is still mounting
    const loneGrid =
        anyGrid !== undefined && anyGrid.closest(TAB_PANEL_SELECTOR) === null
            ? anyGrid
            : undefined;
    return (tabGrid ?? loneGrid)?.parentElement ?? null;
};

type ScopeGroupProps = {
    // "This tab", "Every tab", or "Tiles" on a dashboard without tabs
    name: string;
    label: string;
    scope: FieldScope;
    replacedLabels: string[];
    // Ends each `aria-label`: " on this tab", or nothing without tabs
    scopeSuffix: string;
    clearName: string;
    onAddToUnfiltered: () => void;
    onSwitch: () => void;
    onClear: () => void;
};

// One scope: its count, then the actions that would change something
const ScopeGroup: FC<ScopeGroupProps> = ({
    name,
    label,
    scope,
    replacedLabels,
    scopeSuffix,
    clearName,
    onAddToUnfiltered,
    onSwitch,
    onClear,
}) => {
    const { applied, possible, unfiltered, replaced } = scope;
    const replacedNames = joinLabels(replacedLabels);
    return (
        <Group gap="xs" wrap="nowrap">
            <Group gap={6} wrap="nowrap" aria-live="polite">
                <Text fz="xs" c="dimmed">
                    {name}
                </Text>
                {possible === 0 ? (
                    <Text fz="xs" c="dimmed">
                        no tile has it
                    </Text>
                ) : (
                    <Text fz="xs" fw={600} className={classes.count}>
                        {`${applied} of ${possible}`}
                    </Text>
                )}
            </Group>
            {unfiltered > 0 && (
                <Button
                    size="compact-xs"
                    variant="default"
                    aria-label={`Filter the ${unfiltered} unfiltered ${pluralizeTiles(unfiltered)} by ${label}${scopeSuffix}`}
                    onClick={onAddToUnfiltered}
                >
                    {`Filter ${unfiltered} more`}
                </Button>
            )}
            {replaced > 0 && (
                <Button
                    size="compact-xs"
                    variant="default"
                    aria-label={`Switch ${replaced} ${pluralizeTiles(replaced)} from ${replacedNames} to ${label}${scopeSuffix}`}
                    onClick={onSwitch}
                >
                    {`Switch ${replaced} from ${replacedNames}`}
                </Button>
            )}
            {applied > 0 && (
                <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    aria-label={clearName}
                    onClick={onClear}
                >
                    Clear
                </Button>
            )}
        </Group>
    );
};

const Bar: FC<{ fieldTiles: FieldTiles }> = ({ fieldTiles }) => {
    const {
        field,
        label,
        thisTabScope,
        thisTabReplacedLabels,
        everyTabScope,
        everyTabReplacedLabels,
        addToUnfiltered,
        switchFromOthers,
        clear,
    } = fieldTiles;

    return (
        <Paper
            role="region"
            aria-label={`Tiles filtered by ${label}`}
            shadow="md"
            withBorder
            radius="md"
            className={classes.bar}
        >
            <Group gap="sm" justify="center">
                <Group gap={6} wrap="nowrap">
                    {field !== null && (
                        <FieldIcon item={field} size={14} aria-hidden />
                    )}
                    <Text fz="sm" fw={600} truncate maw={240}>
                        {label}
                    </Text>
                </Group>
                <Divider orientation="vertical" />
                {thisTabScope === null ? (
                    <ScopeGroup
                        name="Tiles"
                        label={label}
                        scope={everyTabScope}
                        replacedLabels={everyTabReplacedLabels}
                        scopeSuffix=""
                        clearName={`Clear ${label} from tiles`}
                        onAddToUnfiltered={() => addToUnfiltered('every-tab')}
                        onSwitch={() => switchFromOthers('every-tab')}
                        onClear={() => clear('every-tab')}
                    />
                ) : (
                    <>
                        <ScopeGroup
                            name="This tab"
                            label={label}
                            scope={thisTabScope}
                            replacedLabels={thisTabReplacedLabels}
                            scopeSuffix=" on this tab"
                            clearName={`Clear ${label} from this tab`}
                            onAddToUnfiltered={() =>
                                addToUnfiltered('this-tab')
                            }
                            onSwitch={() => switchFromOthers('this-tab')}
                            onClear={() => clear('this-tab')}
                        />
                        <Divider orientation="vertical" />
                        <ScopeGroup
                            name="Every tab"
                            label={label}
                            scope={everyTabScope}
                            replacedLabels={everyTabReplacedLabels}
                            scopeSuffix=" on every tab"
                            clearName={`Clear ${label} from every tab`}
                            onAddToUnfiltered={() =>
                                addToUnfiltered('every-tab')
                            }
                            onSwitch={() => switchFromOthers('every-tab')}
                            onClear={() => clear('every-tab')}
                        />
                    </>
                )}
            </Group>
        </Paper>
    );
};

// Floats over the tiles while a field is clicked: what it is on, and what
// would change that. Never for the hovered field
export const FieldTilesBar: FC = () => {
    const { editingRule, highlightedFieldId, waitingFieldIds } =
        useControlsSidebar();
    const getFieldTiles = useFieldTileActions();
    const activeTabUuid = useDashboardContext((c) => c.activeTab?.uuid);

    const fieldId =
        editingRule !== null &&
        highlightedFieldId !== null &&
        (getFilterFields(editingRule).includes(highlightedFieldId) ||
            waitingFieldIds.includes(highlightedFieldId))
            ? highlightedFieldId
            : null;
    const isShown = getFieldTiles !== null && fieldId !== null;
    const container = useGridContainer(activeTabUuid, isShown);

    if (getFieldTiles === null || fieldId === null || container === null)
        return null;
    return createPortal(<Bar fieldTiles={getFieldTiles(fieldId)} />, container);
};
