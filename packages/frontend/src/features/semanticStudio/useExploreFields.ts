/**
 * One explore's fields, loaded when its page opens. Live data sources come
 * from their fields endpoint for people who manage them, so fields that are
 * not in use show too; everything else comes from the compiled explore.
 */
import {
    getItemId,
    type CompiledDimension,
    type CompiledMetric,
    type Explore as CompiledExplore,
    type LiveSourceField,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useExploreByProjectUuid } from '../../hooks/useExplore';
import { useLiveSourceFields } from '../externalConnections/hooks/useLiveSourceFields';
import { type Explore, type Field, type Source } from './model';

const toText = (hint: string | string[] | undefined): string =>
    Array.isArray(hint) ? hint.join('\n') : (hint ?? '');

/** `team: finance, region: eu or us`, or null when nothing is required. */
const attributesText = (
    required: Record<string, string | string[]> | undefined,
): string | null => {
    const entries = Object.entries(required ?? {});
    if (entries.length === 0) return null;
    return entries
        .map(
            ([name, value]) =>
                `${name}: ${Array.isArray(value) ? value.join(' or ') : value}`,
        )
        .join(', ');
};

const fromCompiled = (
    item: CompiledDimension | CompiledMetric,
    tableLabel: string,
): Field => ({
    id: getItemId(item),
    name: item.name,
    label: item.label,
    fieldKind: item.fieldType === 'metric' ? 'metric' : 'dimension',
    type: item.type,
    table: item.table,
    tableLabel,
    description: item.description ?? '',
    aiHint: toText(item.aiHint),
    group: (item.groups ?? []).join(' / '),
    inUse: true,
    definition: { label: 'SQL', value: item.sql },
    visibleTo: attributesText(item.requiredAttributes),
    isInternal: false,
    isRequired: false,
    chartUsage: null,
    lastEdit: null,
});

/** Visible fields of every table in the explore, base table first. */
const compiledFields = (explore: CompiledExplore): Field[] => {
    const tables = [
        explore.baseTable,
        ...Object.keys(explore.tables).filter(
            (name) => name !== explore.baseTable,
        ),
    ];
    return tables.flatMap((name) => {
        const table = explore.tables[name];
        if (!table) return [];
        const dimensions = Object.values(table.dimensions).filter(
            // Time intervals (order_date_month, ...) belong to their base.
            (dimension) =>
                !dimension.hidden && !dimension.timeIntervalBaseDimensionName,
        );
        const metrics = Object.values(table.metrics).filter(
            (metric) => !metric.hidden,
        );
        return [...dimensions, ...metrics].map((item) =>
            fromCompiled(item, table.label),
        );
    });
};

const fromLive = (
    field: LiveSourceField,
    exploreName: string,
    tableLabel: string,
): Field => ({
    id: getItemId({ table: exploreName, name: field.name }),
    name: field.name,
    label: field.label,
    fieldKind: field.kind,
    type: field.type,
    table: exploreName,
    tableLabel,
    description: field.description,
    aiHint: field.aiHint ?? '',
    group: field.group ?? '',
    inUse: field.inUse,
    definition: { label: 'Source', value: field.apiName },
    visibleTo: null,
    isInternal: field.isInternal,
    isRequired: field.isRequired,
    chartUsage: field.usedByChartCount,
    lastEdit: field.lastEdit
        ? { by: field.lastEdit.userName, at: field.lastEdit.at }
        : null,
});

export type ExploreDetails = {
    ymlPath: string | null;
    joinedTables: string[];
    visibleTo: string | null;
};

export const useExploreFields = ({
    projectUuid,
    explore,
    source,
    canManageLive,
}: {
    projectUuid: string;
    explore: Explore;
    source: Source;
    canManageLive: boolean;
}) => {
    const liveConnection =
        source.kind === 'live' && canManageLive
            ? source.connectionUuid
            : undefined;
    const compiled = useExploreByProjectUuid(explore.name, projectUuid);
    const live = useLiveSourceFields({
        projectUuid,
        connectionUuid: liveConnection ?? '',
        enabled: liveConnection !== undefined,
    });

    const fields = useMemo((): Field[] | undefined => {
        if (liveConnection) {
            return live.data
                ? live.data.fields.map((field) =>
                      fromLive(field, live.data.exploreName, explore.label),
                  )
                : undefined;
        }
        return compiled.data ? compiledFields(compiled.data) : undefined;
    }, [liveConnection, live.data, compiled.data, explore.label]);

    const details = useMemo((): ExploreDetails | undefined => {
        if (!compiled.data) return undefined;
        const base = compiled.data.tables[compiled.data.baseTable];
        return {
            ymlPath: compiled.data.ymlPath ?? null,
            joinedTables: compiled.data.joinedTables.map(
                ({ table }) => compiled.data.tables[table]?.label ?? table,
            ),
            visibleTo: attributesText(base?.requiredAttributes),
        };
    }, [compiled.data]);

    const query = liveConnection ? live : compiled;
    return {
        fields,
        details,
        isLoading: query.isInitialLoading,
        error: query.error?.error.message ?? null,
    };
};
