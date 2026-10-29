import { interpolateUiString, type UiStringResolver } from '@lightdash/common';
import { Button, Divider, Group, Paper, Text, Tooltip } from '@mantine/core';
import { useLayoutEffect, useRef, type FC } from 'react';
import { createPortal } from 'react-dom';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectActiveTabUuid,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import { formatTileCount } from './fieldLabels';
import classes from './FieldTilesBar.module.css';
import {
    fieldBarMarker,
    findFieldBarStart,
    findSelectedChip,
} from './mappingFocus';
import { getFilterRows, type FieldScope } from './peers';
import { useBarHost } from './useBarHost';
import {
    useControlsSidebarSelector,
    type FieldApply,
} from './useControlsSidebar';
import {
    nameReplacedFields,
    useFieldTileActions,
    type FieldTiles,
} from './useFieldTileActions';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

// The tiles an apply would change
const getChangeCount = (scope: FieldScope) => scope.unfiltered + scope.replaced;

// What "Filter all tiles" replaces, when it takes tiles off another field
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

// One field's bar, over every tab: every action is always there, disabled
// when it would change nothing
const Bar: FC<{
    fieldTiles: FieldTiles;
    // The last change to this field Undo can take back
    undo: FieldApply | null;
    onUndo: () => void;
    // The filter's only field: clearing it would leave no field
    isOnlyRow: boolean;
}> = ({ fieldTiles, undo, onUndo, isOnlyRow }) => {
    const {
        field,
        label,
        name,
        isNameShared,
        tableLabel,
        everyTabScope,
        canAct,
        applyToAll,
        clear,
    } = fieldTiles;
    const getUiString = useUiStrings();
    const { applied, possible } = everyTabScope;
    const canFilterAll = canAct && getChangeCount(everyTabScope) > 0;
    const canClear = canAct && applied > 0 && !isOnlyRow;
    const replacesTooltip = getReplacesTooltip(
        fieldTiles,
        everyTabScope,
        getUiString,
    );
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
                    {isNameShared && (
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
                                    {interpolateUiString(
                                        getUiString('filters.rail.countOf'),
                                        { applied, total: possible },
                                    )}
                                </Text>
                                {` ${getUiString(
                                    possible === 1
                                        ? 'filters.fieldBar.tilesOf.singular'
                                        : 'filters.fieldBar.tilesOf.plural',
                                )}`}
                            </>
                        )}
                    </Text>
                    <Button
                        size="xs"
                        // Right after a field is added, its Undo is the one step to take
                        variant={undo?.kind === 'add' ? 'filled' : 'subtle'}
                        disabled={undo === null}
                        aria-label={
                            undo === null
                                ? undefined
                                : interpolateUiString(
                                      getUiString(
                                          undo.kind === 'clear'
                                              ? 'filters.fieldBar.undoClearName'
                                              : 'filters.fieldBar.undoApplyName',
                                      ),
                                      {
                                          field: label,
                                          tiles: formatTileCount(
                                              getUiString,
                                              undo.tileCount,
                                          ),
                                      },
                                  )
                        }
                        onClick={press(onUndo)}
                    >
                        {getUiString('filters.fieldBar.undo')}
                    </Button>
                    <Tooltip
                        fz="xs"
                        label={replacesTooltip}
                        disabled={replacesTooltip === null || !canFilterAll}
                    >
                        <Button
                            size="xs"
                            variant="subtle"
                            disabled={!canFilterAll}
                            onClick={press(() => applyToAll('every-tab'))}
                        >
                            {getUiString('filters.fieldBar.filterAllTiles')}
                        </Button>
                    </Tooltip>
                    <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        disabled={!canClear}
                        aria-label={interpolateUiString(
                            getUiString('filters.fieldBar.clearName'),
                            { field: label },
                        )}
                        onClick={press(() => clear('every-tab'))}
                    >
                        {getUiString('filters.fieldBar.clear')}
                    </Button>
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
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);

    // The provider only names a field that still is one
    const fieldId =
        editingRule === null || !isMapping ? null : highlightedFieldId;
    const isShown = fieldTileActions !== null && fieldId !== null;
    const host = useBarHost(activeTabUuid, isShown);

    if (fieldTileActions === null || fieldId === null || host === null)
        return null;
    return createPortal(
        <Bar
            fieldTiles={fieldTileActions.forField(fieldId)}
            undo={fieldUndo?.fieldId === fieldId ? fieldUndo : null}
            onUndo={undoApply}
            isOnlyRow={
                editingRule !== null &&
                getFilterRows(editingRule, dashboardTiles).length <= 1
            }
        />,
        host,
    );
};
