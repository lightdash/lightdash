import { isApiError, type ApiError, type Explore } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import {
    getDevelopmentViewHeaders,
    PUBLISHED_HEADERS,
} from './developmentView';
import { diffModelFields, type FieldChange } from './modelFieldDiff';
import { MODEL_VERSION_KEY } from './studioQueryKeys';

type LightdashApi = ReturnType<typeof useLightdashApi>;

/** One version of a model, asked for by name so it does not follow the page's own view. */
export const modelVersionQuery = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    model: string,
    headers: Record<string, string>,
    enabled = true,
) => ({
    queryKey: [MODEL_VERSION_KEY, projectUuid, model, headers],
    // A model with no such version is a value, so a refetch never drops back to loading with nothing.
    queryFn: () =>
        lightdashApi<Explore>({
            version: 'v1',
            url: `/projects/${projectUuid}/explores/${encodeURIComponent(model)}`,
            method: 'GET',
            body: undefined,
            headers,
        }).catch((error: unknown) => {
            if (isApiError(error) && error.error.statusCode === 404)
                return null;
            throw error;
        }),
    enabled,
    retry: false,
});

export const useModelVersion = (
    projectUuid: string,
    model: string,
    headers: Record<string, string>,
    enabled = true,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<Explore | null, ApiError>(
        modelVersionQuery(lightdashApi, projectUuid, model, headers, enabled),
    );
};

const NO_LIVE: Explore[] = [];
const diffs = new WeakMap<Explore, WeakMap<object, Map<string, FieldChange>>>();

// Every field row asks, so the diff is worked out once per pair of versions.
const changesBetween = (
    live: Explore | null,
    mine: Explore,
): Map<string, FieldChange> => {
    const byLive = diffs.get(mine) ?? new WeakMap();
    diffs.set(mine, byLive);
    const cached = byLive.get(live ?? NO_LIVE);
    if (cached) return cached;
    const changes = new Map(
        diffModelFields(live, mine).map((change) => [change.key, change]),
    );
    byLive.set(live ?? NO_LIVE, changes);
    return changes;
};

/** How the person's unpublished version changes one field, while they view their changes; null when it does not. */
export const useFieldChangeInDevelopment = (
    projectUuid: string | undefined,
    table: string,
    field: string,
): FieldChange | null => {
    // Read at render: switching the view refetches every query, which renders this again.
    const headers = getDevelopmentViewHeaders();
    const isOn = !!projectUuid && !!table && Object.keys(headers).length > 0;
    const live = useModelVersion(
        projectUuid ?? '',
        table,
        PUBLISHED_HEADERS,
        isOn,
    );
    const mine = useModelVersion(projectUuid ?? '', table, headers, isOn);
    if (!isOn || !mine.data || (!live.data && !live.isError)) return null;
    return (
        changesBetween(live.data ?? null, mine.data).get(`${table}.${field}`) ??
        null
    );
};
