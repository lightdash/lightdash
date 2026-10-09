import { Button, Group, Paper, Text } from '@mantine/core';
import { useLayoutEffect, useMemo, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { joinLabels, pluralizeTiles } from './fieldLabels';
import classes from './FieldTilesBar.module.css';
import { getFilterFields, type FieldScope } from './peers';
import { useControlsSidebar } from './useControlsSidebar';
import {
    useFieldTileActions,
    type FieldTiles,
    type TileScope,
} from './useFieldTileActions';
import { usePortalTargets } from './usePortalTargets';

const GRID_KEY = 'grid';
const GRID_SELECTOR = '.react-grid-layout';
const TAB_PANEL_SELECTOR = '[data-tab-uuid]';

// The grid of a tab panel, or the one grid of a dashboard without tabs
const getGridSelector = (key: string) =>
    key === GRID_KEY
        ? GRID_SELECTOR
        : `[data-tab-uuid="${key}"] ${GRID_SELECTOR}`;

// An element of ours right above the active tab's tile grid, so the bar
// scrolls with the tiles and pushes them down
const useBarHost = (
    activeTabUuid: string | undefined,
    isEnabled: boolean,
): HTMLElement | null => {
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
    const grid = tabGrid ?? loneGrid ?? null;

    const [host, setHost] = useState<HTMLElement | null>(null);
    useLayoutEffect(() => {
        if (grid === null) return;
        const element = document.createElement('div');
        grid.before(element);
        setHost(element);
        return () => {
            element.remove();
            setHost(null);
        };
    }, [grid]);
    return host;
};

type ActionsProps = {
    label: string;
    scope: FieldScope;
    replacedLabels: string[];
    // Ends each `aria-label`: " on this tab", or nothing without tabs
    scopeSuffix: string;
    clearLabel: string;
    clearName: string;
    isQuiet: boolean;
    onAddToUnfiltered: () => void;
    onSwitch: () => void;
    onClear: () => void;
};

// The actions of one scope; one that would change nothing is left out
const Actions: FC<ActionsProps> = ({
    label,
    scope,
    replacedLabels,
    scopeSuffix,
    clearLabel,
    clearName,
    isQuiet,
    onAddToUnfiltered,
    onSwitch,
    onClear,
}) => {
    const { applied, unfiltered, replaced } = scope;
    const replacedNames = joinLabels(replacedLabels);
    const variant = isQuiet ? 'subtle' : 'default';
    return (
        <>
            {unfiltered > 0 && (
                <Button
                    size="compact-xs"
                    variant={variant}
                    aria-label={`Add ${label} to the ${unfiltered} unfiltered ${pluralizeTiles(unfiltered)}${scopeSuffix}`}
                    onClick={onAddToUnfiltered}
                >
                    {`Add to ${unfiltered} unfiltered`}
                </Button>
            )}
            {replaced > 0 && (
                <Button
                    size="compact-xs"
                    variant={variant}
                    aria-label={`Switch ${replaced} ${pluralizeTiles(replaced)} from ${replacedNames} to ${label}${scopeSuffix}`}
                    onClick={onSwitch}
                >
                    {`Switch ${replaced} from ${replacedNames}`}
                </Button>
            )}
            {applied > 0 && (
                <Button
                    size="compact-xs"
                    variant={variant}
                    aria-label={clearName}
                    onClick={onClear}
                >
                    {clearLabel}
                </Button>
            )}
        </>
    );
};

const getCountSentence = (
    label: string,
    { applied, possible }: FieldScope,
    hasTabs: boolean,
): string => {
    if (!hasTabs)
        return `${label} is on ${applied} of ${possible} ${pluralizeTiles(possible)}`;
    if (possible === 0) return `No tile on this tab has ${label}`;
    return `${label} is on ${applied} of ${possible} ${pluralizeTiles(possible)} on this tab`;
};

const Bar: FC<{ fieldTiles: FieldTiles }> = ({ fieldTiles }) => {
    const {
        label,
        thisTabScope,
        thisTabReplacedLabels,
        everyTabScope,
        everyTabReplacedLabels,
        addToUnfiltered,
        switchFromOthers,
        clear,
    } = fieldTiles;
    const hasTabs = thisTabScope !== null;
    const mainTileScope: TileScope = hasTabs ? 'this-tab' : 'every-tab';

    return (
        <Paper
            role="region"
            aria-label={`Tiles filtered by ${label}`}
            className={classes.bar}
        >
            <Group gap="xs">
                <Text
                    fz="sm"
                    fw={600}
                    aria-live="polite"
                    className={classes.count}
                >
                    {getCountSentence(
                        label,
                        thisTabScope ?? everyTabScope,
                        hasTabs,
                    )}
                </Text>
                <Actions
                    label={label}
                    scope={thisTabScope ?? everyTabScope}
                    replacedLabels={
                        hasTabs ? thisTabReplacedLabels : everyTabReplacedLabels
                    }
                    scopeSuffix={hasTabs ? ' on this tab' : ''}
                    clearLabel={hasTabs ? 'Clear this tab' : 'Clear from tiles'}
                    clearName={
                        hasTabs
                            ? `Clear ${label} from this tab`
                            : `Clear ${label} from tiles`
                    }
                    isQuiet={false}
                    onAddToUnfiltered={() => addToUnfiltered(mainTileScope)}
                    onSwitch={() => switchFromOthers(mainTileScope)}
                    onClear={() => clear(mainTileScope)}
                />
            </Group>
            {hasTabs && (
                <Group gap="xs" className={classes.everyTab}>
                    <Text fz="xs" c="dimmed" className={classes.everyTabCount}>
                        {`Every tab: ${everyTabScope.applied} of ${everyTabScope.possible}`}
                    </Text>
                    <Actions
                        label={label}
                        scope={everyTabScope}
                        replacedLabels={everyTabReplacedLabels}
                        scopeSuffix=" on every tab"
                        clearLabel="Clear everywhere"
                        clearName={`Clear ${label} from every tab`}
                        isQuiet
                        onAddToUnfiltered={() => addToUnfiltered('every-tab')}
                        onSwitch={() => switchFromOthers('every-tab')}
                        onClear={() => clear('every-tab')}
                    />
                </Group>
            )}
        </Paper>
    );
};

// Over the tiles while a field is clicked: what it is on, and what would
// change that. The hovered field never shows it, so the tiles do not jump
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
    const host = useBarHost(activeTabUuid, isShown);

    if (getFieldTiles === null || fieldId === null || host === null)
        return null;
    return createPortal(<Bar fieldTiles={getFieldTiles(fieldId)} />, host);
};
