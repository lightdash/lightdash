import {
    getFields,
    getItemId,
    isExploreError,
    type AiProjectContextTypedObjectRef,
    type Explore,
    type ExploreError,
} from '@lightdash/common';

export type ResolvedMemoryObject = {
    object: AiProjectContextTypedObjectRef;
    resolved: boolean;
};

export const resolveMemoryObjects = (
    objects: AiProjectContextTypedObjectRef[],
    explores: Record<string, Explore | ExploreError>,
): ResolvedMemoryObject[] =>
    objects.map((object) => {
        const exploreName =
            object.type === 'explore' ? object.name : object.explore;
        const explore = explores[exploreName];
        return {
            object,
            resolved:
                explore !== undefined &&
                !isExploreError(explore) &&
                (object.type === 'explore' ||
                    getFields(explore).some(
                        (field) => getItemId(field) === object.fieldId,
                    )),
        };
    });

/**
 * Retirement licence for the deterministic sweep: retire only when every
 * object the memory names has left the catalog. "All unresolved" rather than
 * "any" — memories are routinely born with some unresolved objects, and a
 * partially stale memory is the consolidation curator's judgment call; full
 * unresolution is provable unmooring. An errored explore blocks retirement:
 * a broken compile hides fields without removing them, so it is not evidence.
 */
export const shouldRetireForUnresolvedObjects = (
    objects: AiProjectContextTypedObjectRef[],
    explores: Record<string, Explore | ExploreError>,
): boolean =>
    objects.length > 0 &&
    resolveMemoryObjects(objects, explores).every(
        (result) => !result.resolved,
    ) &&
    objects.every((object) => {
        const explore =
            explores[object.type === 'explore' ? object.name : object.explore];
        return explore === undefined || !isExploreError(explore);
    });

export const validateMemoryObjects = (
    objects: AiProjectContextTypedObjectRef[],
    explores: Record<string, Explore | ExploreError>,
): {
    resolved: AiProjectContextTypedObjectRef[];
    unresolved: AiProjectContextTypedObjectRef[];
} => {
    const results = resolveMemoryObjects(objects, explores);
    return {
        resolved: results
            .filter((result) => result.resolved)
            .map((result) => result.object),
        unresolved: results
            .filter((result) => !result.resolved)
            .map((result) => result.object),
    };
};
