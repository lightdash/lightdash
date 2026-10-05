import {
    DashboardTileTypes,
    getItemId,
    getItemLabelWithoutTableName,
    isDashboardChartTileType,
    matchFieldByTypeAndName,
    matchFieldExact,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import { type ControlModel, type ControlTileState } from './context';
import { type FilterControlDraft } from './controlDraft';
import { getColumnsOfControlType, getFieldsOfControlType } from './controlType';
import { reconcileDraftWithField } from './filterDraft';
import {
    addFilterField,
    getFilterTargets,
    getFilterTileMapping,
    hasFilterField,
    hasUnknownFilterFields,
    mapFilterTile,
    removeFilterField,
    unmapFilterTile,
    type FilterTile,
} from './filterMapping';
import { getFullDisplayLabels, type LabelledItem } from './labels';
import { getControlOverview, type OverviewTile } from './overview';
import { getControlTileKind, type ControlTileKind } from './tiles';

const SQL_PREFIX = 'sql:';

const toItemId = (target: DashboardFieldTarget): string =>
    target.isSqlColumn ? `${SQL_PREFIX}${target.fieldId}` : target.fieldId;

const toTarget = (id: string): DashboardFieldTarget =>
    id.startsWith(SQL_PREFIX)
        ? {
              fieldId: id.slice(SQL_PREFIX.length),
              tableName: 'mock_table',
              isSqlColumn: true,
          }
        : { fieldId: id, tableName: '' };

type FilterItem = LabelledItem & {
    target: DashboardFieldTarget;
    field: DashboardFilterableField | undefined;
};

type ModelTile = {
    tile: DashboardTile;
    tileUuid: string;
    kind: ControlTileKind;
    // null while the tile's fields or columns are not loaded
    items: FilterItem[] | null;
};

const byMatch =
    (
        field: DashboardFilterableField,
        matcher: (
            a: DashboardFilterableField,
        ) => (b: DashboardFilterableField) => boolean,
    ) =>
    (a: DashboardFilterableField, b: DashboardFilterableField) => {
        const matchA = matcher(field)(a);
        const matchB = matcher(field)(b);
        return matchA === matchB ? 0 : matchA ? -1 : 1;
    };

const NO_RUN_VALUE = () => null;

const isSqlColumn = (id: string): boolean => id.startsWith(SQL_PREFIX);

// A filter control's draft seen through its mappings. Returns null when the
// control being edited is not a filter.
export const useFilterControlModel = (
    draft: FilterControlDraft | null,
    updateRule: (
        updater: (rule: DashboardFilterRule) => DashboardFilterRule,
    ) => void,
    getTabUuid: (tile: DashboardTile) => string | null,
): ControlModel | null => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const isLoadingFields = useDashboardContext(
        (c) => c.isLoadingDashboardFilters || c.isFetchingDashboardFilters,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const sqlChartTilesMetadata = useDashboardTileStatusContext(
        (c) => c.sqlChartTilesMetadata,
    );

    const rule = draft?.rule;
    const controlType = draft?.controlType;

    const fieldsById = useMemo(() => {
        const map = new Map<string, DashboardFilterableField>();
        Object.values(filterableFieldsByTileUuid ?? {}).forEach((fields) =>
            fields.forEach((f) => {
                if (!map.has(getItemId(f))) map.set(getItemId(f), f);
            }),
        );
        return map;
    }, [filterableFieldsByTileUuid]);

    const ownTarget = rule && hasFilterField(rule) ? rule.target : undefined;
    const field: DashboardFilterableField | undefined = useMemo(() => {
        if (!ownTarget || ownTarget.isSqlColumn) return undefined;
        return (
            fieldsById.get(ownTarget.fieldId) ??
            allFilterableFieldsMap[ownTarget.fieldId] ??
            allFilterableMetricsMap[ownTarget.fieldId]
        );
    }, [
        ownTarget,
        fieldsById,
        allFilterableFieldsMap,
        allFilterableMetricsMap,
    ]);

    // What every chart, SQL chart and data app tile offers a filter of this
    // type, in today's order: exact field, same name on another table, the rest
    const tiles = useMemo<ModelTile[]>(() => {
        if (controlType === undefined) return [];
        return (dashboardTiles ?? []).flatMap<ModelTile>((tile) => {
            const kind = getControlTileKind(tile);
            if (!kind) return [];
            const base = { tile, tileUuid: tile.uuid, kind };
            if (isDashboardChartTileType(tile)) {
                const isLoaded =
                    !tile.properties.savedChartUuid ||
                    (!isLoadingFields &&
                        filterableFieldsByTileUuid !== undefined);
                if (!isLoaded) return [{ ...base, items: null }];
                const typed = getFieldsOfControlType(
                    filterableFieldsByTileUuid?.[tile.uuid] ?? [],
                    controlType,
                );
                const sorted = field
                    ? [...typed]
                          .sort(byMatch(field, matchFieldByTypeAndName))
                          .sort(byMatch(field, matchFieldExact))
                    : typed;
                return [
                    {
                        ...base,
                        items: sorted.map<FilterItem>((f) => ({
                            id: getItemId(f),
                            label: getItemLabelWithoutTableName(f),
                            group: f.tableLabel,
                            target: {
                                fieldId: getItemId(f),
                                tableName: f.table,
                            },
                            field: f,
                        })),
                    },
                ];
            }
            if (kind === 'sql') {
                if (
                    tile.type === DashboardTileTypes.SQL_CHART &&
                    !tile.properties.savedSqlUuid
                ) {
                    return [{ ...base, items: [] }];
                }
                const columns = sqlChartTilesMetadata[tile.uuid]?.columns;
                if (!columns) return [{ ...base, items: null }];
                return [
                    {
                        ...base,
                        items: getColumnsOfControlType(columns, controlType)
                            .filter(
                                (column) =>
                                    typeof column.reference === 'string',
                            )
                            .map<FilterItem>((column) => {
                                const id = `${SQL_PREFIX}${column.reference}`;
                                return {
                                    id,
                                    label: column.reference,
                                    group: null,
                                    // The type lets the control reopen as its own type
                                    target: {
                                        ...toTarget(id),
                                        fallbackType: column.type,
                                    },
                                    field: undefined,
                                };
                            }),
                    },
                ];
            }
            // Data app tiles have no field: they are switched on or off
            return [{ ...base, items: [] }];
        });
    }, [
        controlType,
        dashboardTiles,
        isLoadingFields,
        filterableFieldsByTileUuid,
        sqlChartTilesMetadata,
        field,
    ]);

    const filterTiles = useMemo<FilterTile[]>(
        () =>
            tiles.map(({ tileUuid, kind, tile }) => {
                if (kind === 'dataApp') return { tileUuid, kind, fieldIds: [] };
                if (kind === 'sql') {
                    const columns = sqlChartTilesMetadata[tileUuid]?.columns;
                    return {
                        tileUuid,
                        kind,
                        fieldIds: columns
                            ? columns.flatMap(({ reference }) =>
                                  typeof reference === 'string'
                                      ? [reference]
                                      : [],
                              )
                            : null,
                    };
                }
                const isLoaded =
                    !isDashboardChartTileType(tile) ||
                    !tile.properties.savedChartUuid ||
                    (!isLoadingFields &&
                        filterableFieldsByTileUuid !== undefined);
                return {
                    tileUuid,
                    kind,
                    fieldIds: isLoaded
                        ? (filterableFieldsByTileUuid?.[tileUuid] ?? []).map(
                              getItemId,
                          )
                        : null,
                };
            }),
        [
            tiles,
            sqlChartTilesMetadata,
            isLoadingFields,
            filterableFieldsByTileUuid,
        ],
    );

    const itemsById = useMemo(() => {
        const map = new Map<string, FilterItem>();
        tiles.forEach(({ items }) =>
            items?.forEach((item) => {
                if (!map.has(item.id)) map.set(item.id, item);
            }),
        );
        return map;
    }, [tiles]);

    const derived = useMemo(() => {
        if (!rule) return null;
        const overviewTiles: OverviewTile[] = tiles.map(
            ({ tile, tileUuid, kind, items }, index) => {
                const mapping = getFilterTileMapping(rule, filterTiles[index]);
                const isMapped = mapping.kind !== 'unmapped';
                if (kind === 'dataApp') {
                    return {
                        tileUuid,
                        tabUuid: getTabUuid(tile),
                        options: [],
                        mappedId: null,
                        isBulkMapped: false,
                        switch: isMapped ? 'on' : 'off',
                    };
                }
                return {
                    tileUuid,
                    tabUuid: getTabUuid(tile),
                    options: items ? items.map((item) => item.id) : null,
                    mappedId: !isMapped
                        ? null
                        : kind === 'sql'
                          ? `${SQL_PREFIX}${mapping.fieldId}`
                          : mapping.fieldId,
                    isBulkMapped: kind === 'chart',
                    switch: null,
                };
            },
        );
        const items: Record<string, LabelledItem> = {};
        const nameKeys: Record<string, string> = {};
        itemsById.forEach(({ id, label, group, field: itemField }) => {
            items[id] = { id, label, group };
            if (itemField) {
                nameKeys[id] = `${itemField.type}:${itemField.name}`;
            }
        });
        // A saved field that is not among the tiles' options keeps its line.
        // One of another type than the control's (a date control saved with
        // a time field) is named as a field; one no chart has any more is
        // called by its id.
        overviewTiles.forEach(({ mappedId }) => {
            if (mappedId !== null && items[mappedId] === undefined) {
                const saved = fieldsById.get(mappedId);
                items[mappedId] = saved
                    ? {
                          id: mappedId,
                          label: getItemLabelWithoutTableName(saved),
                          group: saved.tableLabel,
                      }
                    : {
                          id: mappedId,
                          label: toTarget(mappedId).fieldId,
                          group: null,
                      };
            }
        });
        const overview = getControlOverview({
            tiles: overviewTiles,
            order: getFilterTargets(rule).map(toItemId),
            nameKeys,
            keepsEmptyRows: false,
        });
        const rowLabels = getFullDisplayLabels(
            [...overview.rows, ...overview.suggestions].map(
                ({ id }) => items[id],
            ),
        );
        const tileStates: Record<string, ControlTileState> = {};
        tiles.forEach(({ tileUuid, items: tileItems }, index) => {
            const { mappedId, switch: tileSwitch } = overviewTiles[index];
            if (tileSwitch !== null) {
                tileStates[tileUuid] = {
                    status: 'switch',
                    isOn: tileSwitch === 'on',
                };
                return;
            }
            const displays = getFullDisplayLabels(tileItems ?? []);
            const options = (tileItems ?? []).map(({ id }) => ({
                id,
                display: displays[id],
            }));
            if (mappedId !== null) {
                tileStates[tileUuid] = {
                    status: 'mapped',
                    itemId: mappedId,
                    display: rowLabels[mappedId],
                    options,
                };
            } else if (tileItems === null) {
                tileStates[tileUuid] = { status: 'loading' };
            } else if (options.length > 0) {
                tileStates[tileUuid] = { status: 'unmapped', options };
            } else {
                tileStates[tileUuid] = { status: 'none' };
            }
        });
        return { overviewTiles, items, rowLabels, overview, tileStates };
    }, [rule, tiles, filterTiles, itemsById, fieldsById, getTabUuid]);

    // Settings made with no field are checked against the control's first one
    const withFirstField = useCallback(
        (current: DashboardFilterRule, item: FilterItem | undefined) =>
            !hasFilterField(current) && item?.field && controlType !== undefined
                ? reconcileDraftWithField(current, controlType, item.field)
                : current,
        [controlType],
    );

    const addItem = useCallback(
        (id: string) => {
            const item = itemsById.get(id);
            if (!item || item.target.isSqlColumn) return;
            updateRule((current) =>
                addFilterField(
                    withFirstField(current, item),
                    item.target,
                    filterTiles,
                ),
            );
        },
        [itemsById, updateRule, withFirstField, filterTiles],
    );

    const removeItem = useCallback(
        (id: string) =>
            updateRule((current) =>
                removeFilterField(
                    current,
                    itemsById.get(id)?.target ?? toTarget(id),
                    filterTiles,
                ),
            ),
        [itemsById, updateRule, filterTiles],
    );

    const setTileItem = useCallback(
        (tileUuid: string, id: string | null) => {
            if (id === null) {
                updateRule((current) =>
                    unmapFilterTile(current, tileUuid, filterTiles),
                );
                return;
            }
            const item = itemsById.get(id);
            if (!item) return;
            updateRule((current) =>
                mapFilterTile(
                    withFirstField(current, item),
                    tileUuid,
                    item.target,
                    filterTiles,
                ),
            );
        },
        [itemsById, updateRule, withFirstField, filterTiles],
    );

    const getField = useCallback(
        (id: string) => itemsById.get(id)?.field,
        [itemsById],
    );

    // Data app tiles: on drops the off entry, off writes it
    const setTileOn = useCallback(
        (tileUuid: string, isOn: boolean) =>
            updateRule((current) =>
                isOn
                    ? mapFilterTile(
                          current,
                          tileUuid,
                          current.target,
                          filterTiles,
                      )
                    : unmapFilterTile(current, tileUuid, filterTiles),
            ),
        [updateRule, filterTiles],
    );

    return useMemo(
        () =>
            derived
                ? {
                      noun: 'field',
                      isLoading: hasUnknownFilterFields(filterTiles),
                      ...derived,
                      field,
                      addItem,
                      removeItem,
                      setTileItem,
                      setTileOn,
                      getField,
                      isSqlColumn,
                      getTileRunValue: NO_RUN_VALUE,
                  }
                : null,
        [
            derived,
            filterTiles,
            field,
            addItem,
            removeItem,
            setTileItem,
            setTileOn,
            getField,
        ],
    );
};
