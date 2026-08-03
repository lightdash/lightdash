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
