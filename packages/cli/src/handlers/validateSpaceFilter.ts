import {
    isTableValidationError,
    ParameterError,
    SpaceSummary,
    ValidationResponse,
} from '@lightdash/common';

export type SpaceFilterMode = 'include' | 'exclude';

type SpaceNode = Pick<SpaceSummary, 'uuid' | 'slug' | 'parentSpaceUuid'>;

/**
 * Resolves space slugs to the set of matching space uuids, cascading into
 * all descendant spaces. Slugs are not unique, so every space with a
 * matching slug is selected. Throws on slugs that match no space.
 */
export const resolveSpaceSelection = (
    spaces: SpaceNode[],
    slugs: string[],
): Set<string> => {
    const unknownSlugs = slugs.filter(
        (slug) => !spaces.some((s) => s.slug === slug),
    );
    if (unknownSlugs.length > 0) {
        const availableSlugs = [...new Set(spaces.map((s) => s.slug))].sort();
        throw new ParameterError(
            `Space slug${
                unknownSlugs.length > 1 ? 's' : ''
            } not found in project (or not visible to your credentials): ${unknownSlugs.join(
                ', ',
            )}. Available space slugs: ${availableSlugs.join(', ')}`,
        );
    }

    const childrenByParent = new Map<string, SpaceNode[]>();
    spaces.forEach((s) => {
        if (s.parentSpaceUuid) {
            const siblings = childrenByParent.get(s.parentSpaceUuid) ?? [];
            siblings.push(s);
            childrenByParent.set(s.parentSpaceUuid, siblings);
        }
    });

    const selected = new Set<string>();
    const queue = spaces.filter((s) => slugs.includes(s.slug));
    while (queue.length > 0) {
        const current = queue.pop()!;
        if (!selected.has(current.uuid)) {
            selected.add(current.uuid);
            queue.push(...(childrenByParent.get(current.uuid) ?? []));
        }
    }
    return selected;
};

export const filterValidationsBySpace = (
    validations: ValidationResponse[],
    selectedSpaceUuids: Set<string>,
    mode: SpaceFilterMode,
): ValidationResponse[] =>
    validations.filter((validation) => {
        const { spaceUuid } = validation;
        // Table errors are project-level, not in spaces — never filtered
        if (isTableValidationError(validation)) return true;
        if (spaceUuid === undefined) return mode === 'exclude';
        const isSelected = selectedSpaceUuids.has(spaceUuid);
        return mode === 'include' ? isSelected : !isSelected;
    });
