import {
    DashboardTileTypes,
    getDashboardFilterSlugs,
    getMalformedParameterControlMessages,
    ParameterError,
    type DashboardAsCode,
    type DashboardAsCodeUpsertResult,
    type DashboardConfig,
    type DashboardDAO,
    type DashboardFilterRule,
    type DashboardFilters,
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

const getTileTargetsWithSlugs = (
    dashboard: DashboardDAO,
    tileTargets: DashboardFilterRule['tileTargets'],
    tileSlugs: Map<string, string> | undefined,
): Record<string, DashboardTileTarget> =>
    Object.entries(tileTargets ?? {}).reduce<
        Record<string, DashboardTileTarget>
    >((result, [tileUuid, target]) => {
        const legacySlug = getTileSlugForTileUuid(dashboard, tileUuid);
        const tileSlug = legacySlug && (tileSlugs?.get(tileUuid) ?? legacySlug);
        return tileSlug ? { ...result, [tileSlug]: target } : result;
    }, {});

/** `filterSlugs` holds each dimension then metric filter's slug to write; null writes none */
export const getFiltersWithTileSlugs = (
    dashboard: DashboardDAO,
    tileSlugs?: Map<string, string>,
    filterSlugs: string[] | null = null,
): Required<NonNullable<DashboardAsCode['filters']>> => {
    const toCode = (
        { slug: _storedSlug, ...filter }: DashboardFilterRule,
        slug: string | undefined,
    ): DashboardFilterRule => ({
        ...filter,
        tileTargets: getTileTargetsWithSlugs(
            dashboard,
            filter.tileTargets,
            tileSlugs,
        ),
        ...(slug !== undefined && { slug }),
    });
    const dimensionCount = dashboard.filters.dimensions.length;
    return {
        ...dashboard.filters,
        dimensions: dashboard.filters.dimensions.map((filter, index) => ({
            ...toCode(filter, filterSlugs?.[index]),
            id: undefined,
        })),
        // Stored filters can predate the metric and table calculation lists
        ...(dashboard.filters.metrics && {
            metrics: dashboard.filters.metrics.map((filter, index) =>
                toCode(filter, filterSlugs?.[dimensionCount + index]),
            ),
        }),
        ...(dashboard.filters.tableCalculations && {
            tableCalculations: dashboard.filters.tableCalculations.map(
                (filter) => toCode(filter, undefined),
            ),
        }),
    };
};

const findTileUuid = (
    tiles: DashboardTileWithSlug[],
    tileSlug: string,
): string | undefined =>
    tiles.find(
        (tile) =>
            tile.tileSlug === tileSlug || getTileContentSlug(tile) === tileSlug,
    )?.uuid;

// Old files keyed metric and table calculation targets by tile uuid
const getTileTargetsWithUuids = (
    tiles: DashboardTileWithSlug[],
    tileTargets: DashboardFilterRule['tileTargets'],
): Record<string, DashboardTileTarget> =>
    Object.entries(tileTargets ?? {}).reduce<
        Record<string, DashboardTileTarget>
    >((result, [tileSlug, target]) => {
        const tileUuid =
            findTileUuid(tiles, tileSlug) ??
            tiles.find((tile) => tile.uuid === tileSlug)?.uuid;
        if (!tileUuid) {
            console.error(
                `Tile with slug ${tileSlug} not found in tilesWithUuids`,
            );
            return result;
        }
        return { ...result, [tileUuid]: target };
    }, {});

const getFilterFieldKey = ({
    target,
}: Pick<DashboardFilterRule, 'target'>): string =>
    JSON.stringify([target.tableName, target.fieldId]);

type SavedFilters = Pick<DashboardFilters, 'dimensions' | 'metrics'>;

/**
 * Keeps a saved filter's id for an uploaded one: by slug first (stored or
 * derived), else when exactly one saved and one uploaded filter share its
 * field. A saved id is used at most once; otherwise mints one.
 */
export const getStableDimensionFilterIds = (
    uploadedFilters: Pick<DashboardFilterRule, 'target' | 'slug'>[],
    savedFilters: SavedFilters,
): string[] => {
    const saved = savedFilters.dimensions;
    const savedSlugs = getDashboardFilterSlugs([
        ...saved,
        ...savedFilters.metrics,
    ]);
    const claimed = new Set<string>();
    const bySlug = uploadedFilters.map(({ slug }) => {
        const index = slug === undefined ? -1 : savedSlugs.indexOf(slug);
        const id =
            index < 0 || index >= saved.length ? undefined : saved[index].id;
        if (id === undefined || claimed.has(id)) return undefined;
        claimed.add(id);
        return id;
    });
    const unclaimed = saved.filter(({ id }) => !claimed.has(id));
    const unmatched = uploadedFilters.filter(
        (_, index) => bySlug[index] === undefined,
    );
    const uploadedCounts = countBy(unmatched, getFilterFieldKey);
    const savedCounts = countBy(unclaimed, getFilterFieldKey);
    return uploadedFilters.map((filter, index) => {
        const slugMatch = bySlug[index];
        if (slugMatch !== undefined) return slugMatch;
        const key = getFilterFieldKey(filter);
        const match =
            uploadedCounts[key] === 1 && savedCounts[key] === 1
                ? unclaimed.find(
                      (candidate) =>
                          getFilterFieldKey(candidate) === key &&
                          // A stored slug never changes: another slug is another filter
                          (filter.slug === undefined ||
                              candidate.slug === undefined),
                  )
                : undefined;
        return match?.id ?? uuidv4();
    });
};

/** Rejects malformed or repeated filter slugs supplied by a file */
const assertValidFilterSlugs = (
    rules: Pick<DashboardFilterRule, 'slug'>[],
): void => {
    const seen = new Set<string>();
    rules.forEach(({ slug }) => {
        if (slug === undefined) return;
        if (
            typeof slug !== 'string' ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
        )
            throw new ParameterError(`Invalid dashboard filter slug "${slug}"`);
        if (seen.has(slug))
            throw new ParameterError(
                `Dashboard filter slug "${slug}" is duplicated`,
            );
        seen.add(slug);
    });
};

/**
 * `useFileSlugs` false ignores filter slugs in the file. Either way, a
 * filter matched to a saved one keeps the saved slug unless the file
 * supplies one.
 */
export const getFiltersWithTileUuids = (
    dashboard: DashboardAsCode,
    tiles: DashboardTileWithSlug[],
    savedFilters: SavedFilters,
    useFileSlugs: boolean,
): DashboardDAO['filters'] => {
    const fileSlug = (slug: string | undefined) =>
        useFileSlugs ? slug : undefined;
    const dimensions = dashboard.filters?.dimensions ?? [];
    const metrics = dashboard.filters?.metrics ?? [];
    if (useFileSlugs) assertValidFilterSlugs([...dimensions, ...metrics]);
    const ids = getStableDimensionFilterIds(
        dimensions.map(({ target, slug }) => ({
            target,
            slug: fileSlug(slug),
        })),
        savedFilters,
    );
    const savedRules = [...savedFilters.dimensions, ...savedFilters.metrics];
    const withTileUuids = ({
        slug: uploadedSlug,
        ...filter
    }: DashboardFilterRule): DashboardFilterRule => {
        const slug =
            fileSlug(uploadedSlug) ??
            savedRules.find((saved) => saved.id === filter.id)?.slug;
        return {
            ...filter,
            tileTargets: getTileTargetsWithUuids(tiles, filter.tileTargets),
            ...(slug !== undefined && { slug }),
        };
    };
    return {
        metrics: metrics.map(withTileUuids),
        tableCalculations: (dashboard.filters?.tableCalculations ?? []).map(
            (filter) => ({
                ...filter,
                tileTargets: getTileTargetsWithUuids(tiles, filter.tileTargets),
            }),
        ),
        dimensions: dimensions.map((filter, index) =>
            withTileUuids({ ...filter, id: ids[index] }),
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
