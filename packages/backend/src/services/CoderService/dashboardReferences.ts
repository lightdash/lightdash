import {
    DashboardTileTypes,
    getMalformedParameterControlMessages,
    ParameterError,
    type DashboardAsCode,
    type DashboardAsCodeUpsertResult,
    type DashboardConfig,
    type DashboardDAO,
    type DashboardFilterRule,
    type DashboardFilterRuleAsCode,
    type DashboardParameterControl,
    type DashboardTile,
    type DashboardTileAsCode,
    type DashboardTileTarget,
    type DashboardTileWithSlug,
    type DateZoomTileTarget,
    type PromotionChanges,
} from '@lightdash/common';
import { countBy } from 'es-toolkit/compat';
import { v4 as uuidv4 } from 'uuid';

type AnyChartTile = Extract<
    DashboardTileAsCode | DashboardTile,
    {
        type: DashboardTileTypes.SAVED_CHART | DashboardTileTypes.SQL_CHART;
    }
>;

export const isAnyChartTile = (
    tile: DashboardTileAsCode | DashboardTile,
): tile is AnyChartTile =>
    tile.type === DashboardTileTypes.SAVED_CHART ||
    tile.type === DashboardTileTypes.SQL_CHART;

// The portable per-tile identity: a chart tile's chart slug, or a data app
// tile's app slug. Suffixed when several tiles reference the same content.
const getTileContentSlug = (
    tile: DashboardTile | DashboardTileAsCode,
): string | undefined => {
    if (isAnyChartTile(tile)) return tile.properties.chartSlug ?? undefined;
    if (tile.type === DashboardTileTypes.DATA_APP)
        return tile.properties.appSlug ?? undefined;
    return undefined;
};

export const getTileSlugForTileUuid = (
    dashboard: DashboardDAO,
    uuid: string,
): string | undefined => {
    const tile = dashboard.tiles.find((item) => item.uuid === uuid);
    const contentSlug = tile ? getTileContentSlug(tile) : undefined;
    if (!tile || contentSlug === undefined) {
        return undefined;
    }
    const matchingTiles = dashboard.tiles.filter(
        (item) => getTileContentSlug(item) === contentSlug,
    );
    if (matchingTiles.length > 1) {
        const index = matchingTiles.findIndex((item) => item.uuid === uuid);
        return `${contentSlug}-${index + 1}`;
    }
    return contentSlug;
};

const mapTileTargets = (
    tileTargets: Record<string, DashboardTileTarget>,
    mapTile: (tile: string) => string | undefined,
): Record<string, DashboardTileTarget> =>
    Object.entries(tileTargets).reduce<Record<string, DashboardTileTarget>>(
        (result, [tile, target]) => {
            const mapped = mapTile(tile);
            return mapped ? { ...result, [mapped]: target } : result;
        },
        {},
    );

/** `filterSlugs` holds each dimension then metric filter's slug to write; null writes none */
export const getFiltersWithTileSlugs = (
    dashboard: DashboardDAO,
    tileSlugs?: Map<string, string>,
    filterSlugs: string[] | null = null,
): Required<NonNullable<DashboardAsCode['filters']>> => {
    const toTileSlug = (tileUuid: string) => {
        const legacySlug = getTileSlugForTileUuid(dashboard, tileUuid);
        return legacySlug && (tileSlugs?.get(tileUuid) ?? legacySlug);
    };
    const toAsCode = (
        { id: _id, ...filter }: DashboardFilterRule,
        slug: string | undefined,
    ): Omit<DashboardFilterRuleAsCode, 'id'> => ({
        ...filter,
        ...(filter.tileTargets && {
            tileTargets: mapTileTargets(filter.tileTargets, toTileSlug),
        }),
        ...(slug !== undefined && { slug }),
    });
    const dimensionCount = dashboard.filters.dimensions.length;
    return {
        dimensions: dashboard.filters.dimensions.map((filter, index) =>
            toAsCode(
                { ...filter, tileTargets: filter.tileTargets ?? {} },
                filterSlugs?.[index],
            ),
        ),
        // Stored filters can predate the metric and table calculation lists
        ...(dashboard.filters.metrics && {
            metrics: dashboard.filters.metrics.map((filter, index) =>
                toAsCode(filter, filterSlugs?.[dimensionCount + index]),
            ),
        }),
        ...(dashboard.filters.tableCalculations && {
            tableCalculations: dashboard.filters.tableCalculations.map(
                (filter) => toAsCode(filter, undefined),
            ),
        }),
    };
};

const findTileUuid = (
    tiles: DashboardTileWithSlug[],
    tileRef: string,
): string | undefined =>
    (
        tiles.find(
            (tile) =>
                tile.tileSlug === tileRef ||
                getTileContentSlug(tile) === tileRef,
        ) ?? tiles.find((tile) => tile.uuid === tileRef)
    )?.uuid;

const getFilterFieldKey = ({
    target,
}: Pick<DashboardFilterRule, 'target'>): string =>
    JSON.stringify([target.tableName, target.fieldId]);

/** Keeps a saved control's id when its key occurs exactly once among the saved and once among the uploaded controls, and no earlier control took that id; otherwise mints one. */
export const getStableIds = <U, S extends { id: string }>(
    uploaded: U[],
    saved: S[],
    keyOf: (control: U | S) => string,
): string[] => {
    const uploadedCounts = countBy(uploaded, keyOf);
    const savedCounts = countBy(saved, keyOf);
    const usedIds = new Set<string>();
    return uploaded.map((control) => {
        const key = keyOf(control);
        const match =
            uploadedCounts[key] === 1 && savedCounts[key] === 1
                ? saved.find((candidate) => keyOf(candidate) === key)
                : undefined;
        const id = match?.id && !usedIds.has(match.id) ? match.id : uuidv4();
        usedIds.add(id);
        return id;
    });
};

export const getStableDimensionFilterIds = (
    uploadedFilters: Pick<DashboardFilterRule, 'target'>[],
    savedFilters: Pick<DashboardFilterRule, 'id' | 'target'>[],
): string[] => getStableIds(uploadedFilters, savedFilters, getFilterFieldKey);

export const getFiltersWithTileUuids = (
    dashboard: DashboardAsCode,
    tiles: DashboardTileWithSlug[],
    savedFilters: Partial<DashboardDAO['filters']> | undefined,
): DashboardDAO['filters'] => {
    const toTileUuid = (tileRef: string) => {
        const tileUuid = findTileUuid(tiles, tileRef);
        if (!tileUuid)
            console.error(
                `Tile with slug ${tileRef} not found in tilesWithUuids`,
            );
        return tileUuid;
    };
    const fromAsCode = (
        filters: Omit<DashboardFilterRuleAsCode, 'id'>[],
        saved: DashboardFilterRule[] = [],
    ): DashboardFilterRule[] => {
        const ids = getStableDimensionFilterIds(filters, saved);
        // A file's slugs only resolve refs inside it; main's request validation dropped them
        return filters.map(({ slug: _slug, ...filter }, index) => ({
            ...filter,
            id: ids[index],
            ...(filter.tileTargets && {
                tileTargets: mapTileTargets(filter.tileTargets, toTileUuid),
            }),
        }));
    };
    return {
        metrics: fromAsCode(
            dashboard.filters?.metrics ?? [],
            savedFilters?.metrics,
        ),
        tableCalculations: fromAsCode(
            dashboard.filters?.tableCalculations ?? [],
            savedFilters?.tableCalculations,
        ),
        dimensions: fromAsCode(
            (dashboard.filters?.dimensions ?? []).map((filter) => ({
                ...filter,
                tileTargets: filter.tileTargets ?? {},
            })),
            savedFilters?.dimensions,
        ),
    };
};

export const getConfigWithDateZoomTileSlugs = (
    dashboard: DashboardDAO,
    tileSlugs?: Map<string, string>,
): DashboardConfig | undefined => {
    const { config } = dashboard;
    if (!config?.dateZoomConfig) return config;
    const tileTargets = Object.entries(
        config.dateZoomConfig.tileTargets ?? {},
    ).reduce<Record<string, DateZoomTileTarget>>(
        (result, [tileUuid, target]) => {
            const legacySlug = getTileSlugForTileUuid(dashboard, tileUuid);
            const tileSlug =
                legacySlug && (tileSlugs?.get(tileUuid) ?? legacySlug);
            return tileSlug ? { ...result, [tileSlug]: target } : result;
        },
        {},
    );
    return {
        ...config,
        dateZoomConfig: { ...config.dateZoomConfig, tileTargets },
    };
};

/** Attaches skipped-tile warnings to a promotion result, omitting the key when there are none. */
export const withTileWarnings = (
    changes: PromotionChanges,
    warnings: string[],
): DashboardAsCodeUpsertResult =>
    warnings.length > 0 ? { ...changes, warnings } : changes;

export const getConfigWithDateZoomTileUuids = <
    T extends Pick<DashboardConfig, 'dateZoomConfig'>,
>(
    config: T,
    tiles: DashboardTileWithSlug[],
): T => {
    if (!config.dateZoomConfig) return config;
    const tileTargets = Object.entries(
        config.dateZoomConfig.tileTargets ?? {},
    ).reduce<Record<string, DateZoomTileTarget>>(
        (result, [tileSlug, target]) => {
            const tileUuid = findTileUuid(tiles, tileSlug);
            if (!tileUuid) {
                console.error(
                    `Tile with slug ${tileSlug} not found for date zoom target`,
                );
                return result;
            }
            return { ...result, [tileUuid]: target };
        },
        {},
    );
    return {
        ...config,
        dateZoomConfig: { ...config.dateZoomConfig, tileTargets },
    };
};

const mapControlTileTargets = (
    controls: DashboardParameterControl[],
    mapTile: (
        tile: string,
        control: DashboardParameterControl,
    ) => string | undefined,
): DashboardParameterControl[] =>
    controls.map((control) => ({
        ...control,
        parameters: Object.fromEntries(
            Object.entries(control.parameters).map(([key, target]) => {
                if (target === 'all') return [key, target];
                const ids = 'only' in target ? target.only : target.except;
                const mapped = ids.flatMap((id) => {
                    const result = mapTile(id, control);
                    return result === undefined ? [] : [result];
                });
                return [
                    key,
                    'only' in target ? { only: mapped } : { except: mapped },
                ];
            }),
        ),
    }));

/** Each saved tile's slug by uuid, as a file names tiles. */
export const getTileSlugsByUuid = (
    tiles: DashboardTileWithSlug[],
): Map<string, string> =>
    new Map(
        tiles.flatMap((tile) => {
            const slug = tile.tileSlug ?? getTileContentSlug(tile);
            return tile.uuid && slug ? [[tile.uuid, slug]] : [];
        }),
    );

export const getParameterControlTileSlugs = (
    dashboard: DashboardDAO,
): Map<string, string> => {
    const reserved = new Set(
        dashboard.tiles.flatMap((tile) => {
            const slug = getTileContentSlug(tile);
            return slug ? [slug] : [];
        }),
    );
    const used = new Set<string>();
    const slugs = new Map<string, string>();
    for (const tile of dashboard.tiles) {
        const contentSlug = getTileContentSlug(tile);
        const base = contentSlug ?? `tile-${tile.uuid}`;
        let slug = getTileSlugForTileUuid(dashboard, tile.uuid) ?? base;
        let suffix = 1;
        while (used.has(slug) || (reserved.has(slug) && slug !== contentSlug)) {
            slug = `${base}-${suffix}`;
            suffix += 1;
        }
        used.add(slug);
        slugs.set(tile.uuid, slug);
    }
    return slugs;
};

export const getConfigWithParameterControlTileSlugs = (
    dashboard: DashboardDAO,
    config: DashboardConfig | undefined,
): DashboardConfig | undefined => {
    if (!config?.parameterControls) return config;
    const slugs = getParameterControlTileSlugs(dashboard);
    return {
        ...config,
        parameterControls: mapControlTileTargets(
            config.parameterControls,
            (tileUuid) => slugs.get(tileUuid),
        ),
    };
};

export const getConfigWithParameterControlTileUuids = (
    config: DashboardConfig,
    tiles: DashboardTileWithSlug[],
): DashboardConfig => {
    if (config.parameterControls === undefined) return config;
    if (!Array.isArray(config.parameterControls)) {
        throw new ParameterError('Parameter controls must be a list');
    }
    const controlIds = new Set<string>();
    const parameterControls = config.parameterControls.map((control) => {
        if (typeof control !== 'object' || control === null) return control;
        const id = control.id || uuidv4();
        if (controlIds.has(id)) {
            throw new ParameterError(
                `Parameter control id ${id} is used by more than one control`,
            );
        }
        controlIds.add(id);
        return { ...control, id };
    });
    const malformed = getMalformedParameterControlMessages(parameterControls);
    if (malformed.length) throw new ParameterError(malformed.join('. '));
    return {
        ...config,
        parameterControls: mapControlTileTargets(
            parameterControls,
            (tileSlug, control) => {
                const matches = tiles.filter(
                    (tile) =>
                        tile.tileSlug === tileSlug ||
                        getTileContentSlug(tile) === tileSlug,
                );
                if (matches.length > 1) {
                    throw new ParameterError(
                        `Tile slug ${tileSlug} is ambiguous for parameter control "${control.label ?? Object.keys(control.parameters)[0] ?? 'parameter'}"`,
                    );
                }
                const tileUuid = matches[0]?.uuid;
                if (!tileUuid) {
                    throw new ParameterError(
                        `Tile with slug ${tileSlug} not found for parameter control "${control.label ?? Object.keys(control.parameters)[0] ?? 'parameter'}"`,
                    );
                }
                return tileUuid;
            },
        ),
    };
};
