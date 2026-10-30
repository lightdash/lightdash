import { interpolateUiString, type UiStringResolver } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Divider,
    Group,
    Paper,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconArrowBackUp } from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { selectActiveTabUuid, useDashboardSelector } from '../dashboard/store';
import { formatTileCount, formatTilesOf } from './fieldLabels';
import classes from './FieldTilesBar.module.css';
import {
    fieldBarMarker,
    findFieldBarStart,
    findSelectedChip,
} from './mappingFocus';
import { type FieldScope } from './peers';
import { useBarHost } from './useBarHost';
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
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

// The tiles an apply would change
const getChangeCount = (scope: FieldScope) => scope.unfiltered + scope.replaced;

// The tab in view first, then the other tabs; null when neither has tiles left
const getTarget = (
    tabScope: FieldScope,
    otherTabsScope: FieldScope | null,
    getCount: (scope: FieldScope) => number,
): { tileScope: TileScope; scope: FieldScope } | null => {
    if (getCount(tabScope) > 0)
        return { tileScope: 'this-tab', scope: tabScope };
    if (otherTabsScope !== null && getCount(otherTabsScope) > 0)
        return { tileScope: 'other-tabs', scope: otherTabsScope };
    return null;
};

// What a fill replaces, when it takes tiles off another field
const getReplacesTooltip = (
    fieldTiles: FieldTiles,
    scope: FieldScope,
    getUiString: UiStringResolver,
): string | null =>
    scope.replaced === 0
        ? null
        : interpolateUiString(getUiString('filters.fieldBar.replacesTooltip'), {
              fields: nameReplacedFields(
                  scope.replacedFieldIds.map(fieldTiles.labelOf),
                  getUiString,
              ),
              tiles: formatTileCount(getUiString, scope.replaced),
          });

// One field's bar: the count over every tab, Filter and Clear over the tab in
// view first, then the other tabs; disabled when they would change nothing
const Bar: FC<{
    fieldTiles: FieldTiles;
    // The last change to this field Undo can take back
    undo: FieldApply | null;
    onUndo: () => void;
    // The filter's only field: clearing it would leave no field
    isOnlyRow: boolean;
    /** Shown for a new chip selection, not moved to another tab's grid. */
    isArriving: boolean;
}> = ({ fieldTiles, undo, onUndo, isOnlyRow, isArriving }) => {
    // Kept from mount: a later render must not cut the slide short
    const [arrives] = useState(isArriving);
    const {
        field,
        label,
        name,
        tableLabel,
        thisTabScope,
        otherTabsScope,
        everyTabScope,
        canAct,
        applyToAll,
        clear,
    } = fieldTiles;
    const getUiString = useUiStrings();
    const { applied, possible } = everyTabScope;
    const tilesOf = formatTilesOf(getUiString, applied, possible);
    // Without tabs the tab in view is every tile
    const tabScope = thisTabScope ?? everyTabScope;
    const fill = getTarget(tabScope, otherTabsScope, getChangeCount);
    const emptying = getTarget(
        tabScope,
        otherTabsScope,
        (scope) => scope.applied,
    );
    const canFill = canAct && fill !== null;
    const canClear = canAct && emptying !== null && !isOnlyRow;
    const fillLabel =
        fill === null
            ? getUiString('filters.fieldBar.filterMoreNone')
            : interpolateUiString(
                  getUiString(
                      fill.tileScope === 'other-tabs'
                          ? 'filters.fieldBar.filterOnOtherTabs'
                          : 'filters.fieldBar.filterMore',
                  ),
                  { count: getChangeCount(fill.scope) },
              );
    const clearLabel =
        emptying === null
            ? getUiString('filters.fieldBar.clear')
            : interpolateUiString(
                  getUiString(
                      emptying.tileScope === 'other-tabs'
                          ? 'filters.fieldBar.clearOnOtherTabs'
                          : 'filters.fieldBar.clearCount',
                  ),
                  { count: emptying.scope.applied },
              );
    const replacesTooltip =
        fill === null
            ? null
            : getReplacesTooltip(fieldTiles, fill.scope, getUiString);
    const regionRef = useRef<HTMLDivElement>(null);
    const wasPressedRef = useRef(false);
    // A pressed button that is switched off leaves focus on the bar
    useLayoutEffect(() => {
        const region = regionRef.current;
        if (!wasPressedRef.current || region === null) return;
        // Only the render that follows the press: a later one must not move focus
        wasPressedRef.current = false;
        const focused = document.activeElement;
        if (
            focused instanceof HTMLButtonElement &&
            region.contains(focused) &&
            focused.disabled
        ) {
            region.focus();
            return;
        }
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
            data-arrive={arrives || undefined}
            data-controls-editor
            {...fieldBarMarker}
            // Shift+Tab from its start goes back to the chip it belongs to
            onKeyDown={(event) => {
                if (event.key !== 'Tab' || !event.shiftKey) return;
                const target = event.target;
                if (
                    target !== regionRef.current &&
                    target !== findFieldBarStart()
                )
                    return;
                const chip = findSelectedChip();
                if (chip === null) return;
                event.preventDefault();
                chip.focus();
            }}
        >
            <Group gap="md" justify="center">
                <Group gap={6} wrap="nowrap">
                    {field !== null && (
                        <FieldIcon item={field} size={16} aria-hidden />
                    )}
                    {field !== null && (
                        <Tooltip fz="xs" label={label}>
                            <Text fz="sm" c="dimmed" truncate maw={120}>
                                {tableLabel}
                            </Text>
                        </Tooltip>
                    )}
                    <Text fz="sm" fw={600} truncate maw={240}>
                        {name}
                    </Text>
                </Group>
                <Divider orientation="vertical" />
                <Group gap="sm">
                    <Text fz="sm" aria-live="polite">
                        {possible === 0 ? (
                            getUiString('filters.fieldBar.noTile')
                        ) : (
                            <>
                                <Text span fw={600} className={classes.count}>
                                    {tilesOf.count}
                                </Text>
                                {` ${tilesOf.noun}`}
                            </>
                        )}
                    </Text>
                    <Tooltip
                        fz="xs"
                        label={replacesTooltip}
                        disabled={replacesTooltip === null || !canFill}
                    >
                        <Button
                            size="xs"
                            // Right after a tile card's pick, filling the rest is the next step
                            variant={
                                undo?.kind === 'pick' && canFill
                                    ? 'filled'
                                    : 'subtle'
                            }
                            disabled={!canFill}
                            onClick={press(() => {
                                if (fill !== null) applyToAll(fill.tileScope);
                            })}
                        >
                            {fillLabel}
                        </Button>
                    </Tooltip>
                    <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        disabled={!canClear}
                        onClick={press(() => {
                            if (emptying !== null) clear(emptying.tileScope);
                        })}
                    >
                        {clearLabel}
                    </Button>
                    {undo !== null && (
                        <>
                            <Divider orientation="vertical" />
                            <Tooltip
                                fz="xs"
                                label={getUiString('filters.fieldBar.undo')}
                            >
                                <ActionIcon
                                    size="sm"
                                    // Right after a field is added, its Undo is the one step to take
                                    variant={
                                        undo.kind === 'add'
                                            ? 'filled'
                                            : 'subtle'
                                    }
                                    aria-label={interpolateUiString(
                                        getUiString(
                                            undo.kind === 'clear'
                                                ? 'filters.fieldBar.undoClearName'
                                                : 'filters.fieldBar.undoFilterName',
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
                                    <MantineIcon icon={IconArrowBackUp} />
                                </ActionIcon>
                            </Tooltip>
                        </>
                    )}
                </Group>
            </Group>
        </Paper>
    );
};

// Floats over the tiles while a chip is selected in mapping: that one
// field's count and actions. Never for the hovered field
export const FieldTilesBar: FC = () => {
    const isMapping = useControlsSidebarSelector((c) => c.isMapping);
    const editingRule = useControlsSidebarSelector((c) =>
        c.isMapping ? c.editingRule : null,
    );
    const highlightedFieldId = useControlsSidebarSelector(
        (c) => c.highlightedFieldId,
    );
    const fieldUndo = useControlsSidebarSelector((c) => c.fieldUndo);
    const undoApply = useControlsSidebarSelector((c) => c.undoApply);
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);
    const fieldTileActions = useFieldTileActions(sqlColumnsByTile);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);

    // The provider only names a field that still is one
    const fieldId =
        editingRule === null || !isMapping ? null : highlightedFieldId;
    const isShown = fieldTileActions !== null && fieldId !== null;
    const host = useBarHost(activeTabUuid, isShown);
    // The field the bar was last drawn for: a tab switch draws it again in
    // another grid, which must not replay its slide
    const drawnFieldId = useRef<string | null>(null);
    const isDrawn = isShown && host !== null;
    useLayoutEffect(() => {
        if (fieldId === null) drawnFieldId.current = null;
        else if (isDrawn) drawnFieldId.current = fieldId;
    });

    if (fieldTileActions === null || fieldId === null || host === null)
        return null;
    return createPortal(
        <Bar
            // A new field draws a new bar, which slides in again
            key={fieldId}
            fieldTiles={fieldTileActions.forField(fieldId)}
            undo={fieldUndo?.fieldId === fieldId ? fieldUndo : null}
            onUndo={undoApply}
            isArriving={drawnFieldId.current !== fieldId}
            isOnlyRow={fieldTileActions.chips.length <= 1}
        />,
        host,
    );
};
