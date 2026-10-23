import { interpolateUiString, type UiStringResolver } from '@lightdash/common';
import { Button, Divider, Group, Paper, Text, Tooltip } from '@mantine/core';
import { useLayoutEffect, useMemo, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { selectActiveTabUuid, useDashboardSelector } from '../dashboard/store';
import { formatTileCount } from './fieldLabels';
import classes from './FieldTilesBar.module.css';
import { type FieldScope } from './peers';
import {
    useControlsSidebarSelector,
    type FieldApply,
} from './useControlsSidebar';
import {
    nameReplacedFields,
    useFieldTileActions,
    type FieldTiles,
    type TileScope,
} from './useFieldTileActions';
import { usePortalTargets } from './usePortalTargets';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const GRID_KEY = 'grid';
const GRID_SELECTOR = '.react-grid-layout';
const TAB_PANEL_SELECTOR = '[data-tab-uuid]';

// The grid of a tab panel, or the one grid of a dashboard without tabs
const getGridSelector = (key: string) =>
    key === GRID_KEY
        ? GRID_SELECTOR
        : `[data-tab-uuid="${key}"] ${GRID_SELECTOR}`;

// An element of ours right after the active tab's tile grid, where the bar
// floats. Keyed on the grid, so it follows a grid that is mounted again
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
        element.className = classes.host;
        grid.after(element);
        setHost(element);
        return () => {
            element.remove();
            setHost(null);
        };
    }, [grid]);
    return host;
};

// The tiles of a scope an apply would change
const getChangeCount = (scope: FieldScope) => scope.unfiltered + scope.replaced;

// What "Apply to all" would do over a scope: the tiles it ends up on and what
// it replaces, in the button's name, and that again in a tooltip when it
// replaces another field. Null: nothing to change
type ApplyNameKey =
    | 'filters.fieldBar.applyName'
    | 'filters.fieldBar.applyNameOnThisTab'
    | 'filters.fieldBar.applyNameOnEveryTab';

const getUseOnAll = (
    fieldTiles: FieldTiles,
    scope: FieldScope,
    nameKey: ApplyNameKey,
    getUiString: UiStringResolver,
): { name: string; tooltip: string | null } | null => {
    if (getChangeCount(scope) === 0) return null;
    const replaced = {
        fields: nameReplacedFields(
            scope.replacedFieldIds.map(fieldTiles.labelOf),
            getUiString,
        ),
        tiles: formatTileCount(getUiString, scope.replaced),
    };
    const name = interpolateUiString(getUiString(nameKey), {
        field: fieldTiles.label,
        tiles: formatTileCount(getUiString, scope.possible),
    });
    return scope.replaced > 0
        ? {
              name: interpolateUiString(
                  getUiString('filters.fieldBar.replacingName'),
                  { name, ...replaced },
              ),
              tooltip: interpolateUiString(
                  getUiString('filters.fieldBar.replacesTooltip'),
                  replaced,
              ),
          }
        : { name, tooltip: null };
};

// After the count: what the last apply replaced, or what the last clear took
const getUndoNote = (
    { kind, tileCount, replaced, acrossTabs }: FieldApply,
    getUiString: UiStringResolver,
): string => {
    if (kind === 'clear')
        return interpolateUiString(
            getUiString(
                acrossTabs
                    ? 'filters.fieldBar.clearedAcrossTabs'
                    : 'filters.fieldBar.cleared',
            ),
            { count: tileCount },
        );
    if (replaced === 0) return '';
    return interpolateUiString(
        getUiString(
            acrossTabs
                ? 'filters.fieldBar.replacedAcrossTabs'
                : 'filters.fieldBar.replaced',
        ),
        { count: replaced },
    );
};

const Bar: FC<{
    fieldTiles: FieldTiles;
    // The last "Apply to all" on this field, while Undo can take it back
    undo: FieldApply | null;
    onUndo: () => void;
}> = ({ fieldTiles, undo, onUndo }) => {
    const {
        field,
        label,
        thisTabScope,
        everyTabScope,
        canAct,
        applyToAll,
        clear,
    } = fieldTiles;
    const getUiString = useUiStrings();
    // The tab in view, or every tile on a dashboard without tabs
    const hasTabs = thisTabScope !== null;
    const tileScope: TileScope = hasTabs ? 'this-tab' : 'every-tab';
    const { applied, possible } = thisTabScope ?? everyTabScope;
    // Ends the count
    const countSuffix = getUiString(
        hasTabs
            ? possible === 1
                ? 'filters.fieldBar.tilesOfOnThisTab.singular'
                : 'filters.fieldBar.tilesOfOnThisTab.plural'
            : possible === 1
              ? 'filters.fieldBar.tilesOf.singular'
              : 'filters.fieldBar.tilesOf.plural',
    );
    const useOnScope = getUseOnAll(
        fieldTiles,
        thisTabScope ?? everyTabScope,
        hasTabs
            ? 'filters.fieldBar.applyNameOnThisTab'
            : 'filters.fieldBar.applyName',
        getUiString,
    );
    // Only when it would change a tile on another tab
    const useOnEveryTab =
        thisTabScope !== null &&
        getChangeCount(everyTabScope) > getChangeCount(thisTabScope)
            ? getUseOnAll(
                  fieldTiles,
                  everyTabScope,
                  'filters.fieldBar.applyNameOnEveryTab',
                  getUiString,
              )
            : null;
    const regionRef = useRef<HTMLDivElement>(null);
    const wasPressedRef = useRef(false);
    // A pressed button leaves once its action is done: focus stays on the bar
    useLayoutEffect(() => {
        const region = regionRef.current;
        if (!wasPressedRef.current || region === null) return;
        // Only the render that follows the press: a later one must not move focus
        wasPressedRef.current = false;
        const focused = document.activeElement;
        if (region.contains(focused)) return;
        if (focused === null || focused === document.body) region.focus();
    });
    const press = (action: () => void) => () => {
        wasPressedRef.current = true;
        action();
    };

    return (
        <Paper
            ref={regionRef}
            role="region"
            tabIndex={-1}
            aria-label={interpolateUiString(
                getUiString('filters.fieldBar.region'),
                { field: label },
            )}
            shadow="md"
            radius="md"
            className={classes.bar}
        >
            <Group gap="md" justify="center">
                <Group gap={6} wrap="nowrap">
                    {field !== null && (
                        <FieldIcon item={field} size={16} aria-hidden />
                    )}
                    <Text fz="sm" fw={600} truncate maw={240}>
                        {label}
                    </Text>
                </Group>
                <Divider orientation="vertical" />
                <Group gap="sm">
                    {possible === 0 ? (
                        <Text fz="sm" c="dimmed" aria-live="polite">
                            {getUiString(
                                hasTabs
                                    ? 'filters.fieldBar.noTileOnThisTab'
                                    : 'filters.fieldBar.noTile',
                            )}
                        </Text>
                    ) : (
                        <Text fz="sm" aria-live="polite">
                            <Text span fw={600} className={classes.count}>
                                {interpolateUiString(
                                    getUiString('filters.rail.countOf'),
                                    { applied, total: possible },
                                )}
                            </Text>
                            {` ${countSuffix}`}
                            {undo !== null && getUndoNote(undo, getUiString)}
                        </Text>
                    )}
                    {useOnScope !== null && (
                        <Tooltip
                            label={useOnScope.tooltip}
                            disabled={useOnScope.tooltip === null}
                        >
                            <Button
                                size="xs"
                                variant="light"
                                aria-label={useOnScope.name}
                                onClick={press(() => applyToAll(tileScope))}
                            >
                                {getUiString('filters.fieldBar.applyToAll')}
                            </Button>
                        </Tooltip>
                    )}
                    {useOnEveryTab !== null && (
                        <Tooltip
                            label={useOnEveryTab.tooltip}
                            disabled={useOnEveryTab.tooltip === null}
                        >
                            <Button
                                size="xs"
                                variant="subtle"
                                aria-label={useOnEveryTab.name}
                                onClick={press(() => applyToAll('every-tab'))}
                            >
                                {getUiString('filters.fieldBar.applyToAllTabs')}
                            </Button>
                        </Tooltip>
                    )}
                    {undo !== null && (
                        <Button
                            size="xs"
                            variant="subtle"
                            aria-label={interpolateUiString(
                                getUiString(
                                    undo.kind === 'apply'
                                        ? 'filters.fieldBar.undoApplyName'
                                        : 'filters.fieldBar.undoClearName',
                                ),
                                {
                                    field: label,
                                    tiles: formatTileCount(
                                        getUiString,
                                        undo.tileCount,
                                    ),
                                },
                            )}
                            onClick={press(onUndo)}
                        >
                            {getUiString('filters.fieldBar.undo')}
                        </Button>
                    )}
                    {applied > 0 && (
                        <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            // Loading: what a tile offers is not known yet
                            disabled={!canAct}
                            aria-label={interpolateUiString(
                                getUiString(
                                    hasTabs
                                        ? 'filters.fieldBar.clearNameOnThisTab'
                                        : 'filters.fieldBar.clearName',
                                ),
                                { field: label },
                            )}
                            onClick={press(() => clear(tileScope))}
                        >
                            {getUiString('filters.fieldBar.clear')}
                        </Button>
                    )}
                </Group>
            </Group>
        </Paper>
    );
};

// Floats over the tiles while a field is clicked: what it is on, and what
// would change that. Never for the hovered field
export const FieldTilesBar: FC = () => {
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const highlightedFieldId = useControlsSidebarSelector(
        (c) => c.highlightedFieldId,
    );
    const fieldUndo = useControlsSidebarSelector((c) => c.fieldUndo);
    const undoApply = useControlsSidebarSelector((c) => c.undoApply);
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);
    const fieldTileActions = useFieldTileActions(sqlColumnsByTile);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);

    // The provider only names a field that still is one
    const fieldId = editingRule === null ? null : highlightedFieldId;
    const isShown = fieldTileActions !== null && fieldId !== null;
    const host = useBarHost(activeTabUuid, isShown);

    if (fieldTileActions === null || fieldId === null || host === null)
        return null;
    return createPortal(
        <Bar
            fieldTiles={fieldTileActions.forField(fieldId)}
            undo={fieldUndo?.fieldId === fieldId ? fieldUndo : null}
            onUndo={undoApply}
        />,
        host,
    );
};
