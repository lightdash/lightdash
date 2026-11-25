/**
 * State for Semantic Layer: selection and unsaved field edits.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type FieldDraft } from './fieldDraft';
import {
    buildProjectTree,
    getSource,
    nodeKey,
    refExists,
    resolveRef,
    type Explore,
    type Field,
    type NodeRef,
    type Project,
} from './model';
import { keepsKindPage, type StudioPermissions } from './permissions';
import {
    isSameRoute,
    isSemanticStudioPath,
    parseSemanticStudioPath,
    type StudioRoute,
} from './urls';

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

const draftKey = (explore: Explore, field: Field) =>
    `${explore.id}:${field.id}`;

export const useSemanticStudio = ({
    project,
    permissions,
    canOpenSettings,
    route,
    onNavigate,
}: SemanticStudioProps) => {
    const tree = useMemo(() => buildProjectTree(project), [project]);
    // A link to something that no longer exists opens the project root.
    const isStale =
        !keepsKindPage(permissions, route.ref) &&
        !refExists(project, route.ref);
    const selected = isStale
        ? null
        : resolveRef(project, tree.nodes, route.ref);
    useEffect(() => {
        if (!isStale) return;
        // Only while the address still names the missing page: an action
        // that already moved on, like deleting a source and opening its
        // kind's list, wins over this older render.
        const { pathname } = window.location;
        if (
            isSemanticStudioPath(pathname) &&
            !isSameRoute(parseSemanticStudioPath(pathname), route)
        )
            return;
        onNavigate({ ref: null }, { replace: true });
    }, [isStale, onNavigate, route]);
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
