/**
 * State for Semantic Layer: selection, unsaved field edits and search.
 */
import {
    type ApiCatalogResults,
    type ApiError,
    type CatalogField,
} from '@lightdash/common';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import {
    buildProjectTree,
    getSource,
    nodeKey,
    refExists,
    resolveRef,
    searchProject,
    type Explore,
    type Field,
    type FieldMatch,
    type Kind,
    type NodeRef,
    type Project,
    type ProjectTree,
} from './model';
import { type StudioRoute } from './urls';

/**
 * Who can edit what, from the project CASL abilities (the same checks the
 * backend runs for each writer):
 * - modelled: manage SourceCode (developer+)
 * - sqlViews: manage VirtualView (developer+)
 * - files: manage ExternalSource (editor+)
 * - live: manage ExternalConnection (admin); the only role that can read a
 *   live source's fields that are not in use
 */
export type StudioPermissions = Record<Kind, boolean>;

export type SemanticStudioProps = {
    project: Project;
    permissions: StudioPermissions;
    /** Whether project settings open, so Settings links lead somewhere. */
    canOpenSettings: boolean;
    /** The page in the URL: what is selected. */
    route: StudioRoute;
    /** Moves to another page; `replace` for steps that shouldn't stack up. */
    onNavigate: (route: StudioRoute, options?: { replace?: boolean }) => void;
};

export type FieldDraft = {
    label: string;
    description: string;
    aiHint: string;
    inUse: boolean;
};

const draftKey = (explore: Explore, field: Field) =>
    `${explore.id}:${field.id}`;

const MIN_FIELD_SEARCH = 2;

/** Field matches across the project, from the data catalog search. */
const useFieldSearch = (projectUuid: string, query: string) => {
    const lightdashApi = useLightdashApi();
    const search = query.trim();
    return useQuery<FieldMatch[], ApiError>({
        queryKey: ['semantic-layer-field-search', projectUuid, search],
        enabled: search.length >= MIN_FIELD_SEARCH,
        keepPreviousData: true,
        staleTime: 60_000,
        queryFn: async () => {
            const items = await lightdashApi<ApiCatalogResults>({
                url: `/projects/${projectUuid}/dataCatalog?${new URLSearchParams(
                    { search, type: 'field' },
                ).toString()}`,
                method: 'GET',
                body: undefined,
            });
            return items
                .filter((item): item is CatalogField => item.type === 'field')
                .map((item) => ({
                    name: item.name,
                    label: item.label ?? item.name,
                    tableName: item.tableName,
                    fieldType:
                        item.fieldType === 'metric' ? 'metric' : 'dimension',
                }));
        },
    });
};

/**
 * The sidebar search. Sources, folders and explores match on every
 * keystroke, deferred so typing never waits on the list; fields come from the
 * catalog once typing pauses. Its state lives with the search box, so typing
 * never re-renders the page beside it.
 */
export const useProjectSearch = (project: Project, tree: ProjectTree) => {
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search);
    const [debouncedSearch] = useDebouncedValue(search, 200);
    const fieldSearch = useFieldSearch(project.id, debouncedSearch);
    const needle = deferredSearch.trim().toLowerCase();
    const fieldMatches = useMemo(() => {
        if (needle.length < MIN_FIELD_SEARCH || !fieldSearch.data) return [];
        // While a newer request runs, keep only the earlier matches that
        // still fit, so no stale field shows under the new text.
        return fieldSearch.isPreviousData ||
            debouncedSearch.trim().toLowerCase() !== needle
            ? fieldSearch.data.filter(
                  ({ label, name }) =>
                      label.toLowerCase().includes(needle) ||
                      name.toLowerCase().includes(needle),
              )
            : fieldSearch.data;
    }, [needle, fieldSearch.data, fieldSearch.isPreviousData, debouncedSearch]);
    const results = useMemo(
        () => searchProject(tree, deferredSearch, fieldMatches),
        [tree, deferredSearch, fieldMatches],
    );
    const isSearching = search.trim().length > 0;
    return {
        search,
        setSearch,
        /** The text the results match, a step behind what's typed. */
        query: deferredSearch,
        isSearching,
        results,
        isSearchingFields:
            isSearching &&
            needle.length >= MIN_FIELD_SEARCH &&
            (fieldSearch.isFetching || debouncedSearch !== search),
    };
};

export type ProjectSearch = ReturnType<typeof useProjectSearch>;

export const useSemanticStudio = ({
    project,
    permissions,
    canOpenSettings,
    route,
    onNavigate,
}: SemanticStudioProps) => {
    const tree = useMemo(() => buildProjectTree(project), [project]);
    // A link to something that no longer exists opens the project root.
    const isStale = !refExists(project, route.ref);
    const selected = isStale
        ? null
        : resolveRef(project, tree.nodes, route.ref);
    useEffect(() => {
        if (isStale) onNavigate({ ref: null }, { replace: true });
    }, [isStale, onNavigate]);
    // Unsaved edits, per field, so closing a field's details keeps them.
    const [drafts, setDrafts] = useState<ReadonlyMap<string, FieldDraft>>(
        () => new Map(),
    );
    const setDraft = useCallback(
        (explore: Explore, field: Field, draft: FieldDraft | null) =>
            setDrafts((previous) => {
                const next = new Map(previous);
                const key = draftKey(explore, field);
                if (draft) next.set(key, draft);
                else next.delete(key);
                return next;
            }),
        [],
    );

    return {
        project,
        permissions,
        canManage: (kind: Kind) => permissions[kind],
        canOpenSettings,
        /** Only live data sources save field edits today. */
        canEditFields: (explore: Explore) => {
            const source = getSource(project, explore.sourceId);
            return source.kind === 'live' && permissions.live;
        },
        selected,
        selectedKey: selected ? nodeKey(selected) : null,
        select: (ref: NodeRef | null, options?: { replace?: boolean }) =>
            onNavigate({ ref }, options),
        tree,
        getDraft: (explore: Explore, field: Field) =>
            drafts.get(draftKey(explore, field)),
        setDraft,
    };
};

export type ViewModel = ReturnType<typeof useSemanticStudio>;

export type FieldFilter = 'all' | 'inUse' | 'notInUse' | 'noDescription';

/** What the field search matches, lowercased once per field. */
const haystacks = new WeakMap<Field, string>();
const haystackOf = (field: Field): string => {
    let haystack = haystacks.get(field);
    if (haystack === undefined) {
        haystack = [field.label, field.name, field.definition.value]
            .join('\n')
            .toLowerCase();
        haystacks.set(field, haystack);
    }
    return haystack;
};

export const filterFields = (
    fields: Field[],
    filter: FieldFilter,
    query: string,
    showInternal: boolean,
): Field[] => {
    const needle = query.trim().toLowerCase();
    return fields.filter((field) => {
        if (!showInternal && field.isInternal && !field.inUse) return false;
        if (filter === 'inUse' && !field.inUse) return false;
        if (filter === 'notInUse' && field.inUse) return false;
        if (filter === 'noDescription' && field.description.trim())
            return false;
        return !needle || haystackOf(field).includes(needle);
    });
};

/** Dimensions first, then metrics; the YAML order holds within each. */
const byKind = (fields: Field[]): Field[] => [
    ...fields.filter(({ fieldKind }) => fieldKind !== 'metric'),
    ...fields.filter(({ fieldKind }) => fieldKind === 'metric'),
];

export const useFieldListState = (
    allFields: Field[],
    /** The open row stays, whatever the filter says about it now. */
    openFieldId: string | null = null,
) => {
    const [showInternal, setShowInternal] = useState(false);
    const [filter, setFilter] = useState<FieldFilter>('all');
    const [query, setQuery] = useState('');
    // Typing stays responsive on 2,000+ fields; the list catches up.
    const deferredQuery = useDeferredValue(query);
    const sorted = useMemo(() => byKind(allFields), [allFields]);
    const fields = useMemo(() => {
        const matching = filterFields(
            sorted,
            filter,
            deferredQuery,
            showInternal,
        );
        const open = openFieldId
            ? sorted.find(({ id }) => id === openFieldId)
            : undefined;
        if (!open || matching.includes(open)) return matching;
        // Keep the open row where it sits in the full list.
        const keep = new Set(matching).add(open);
        return sorted.filter((field) => keep.has(field));
    }, [sorted, filter, deferredQuery, showInternal, openFieldId]);
    return {
        fields,
        toolbarProps: {
            filter,
            onFilterChange: setFilter,
            query,
            onQueryChange: setQuery,
            showInternal,
            onShowInternalChange: setShowInternal,
            hasInternal: allFields.some(({ isInternal }) => isInternal),
        },
    };
};
