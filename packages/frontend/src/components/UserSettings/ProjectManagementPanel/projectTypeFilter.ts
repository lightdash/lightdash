import { assertUnreachable, ProjectType } from '@lightdash/common';

/** The type filter above the project management list. */
export enum ProjectTypeFilter {
    ALL = 'all',
    DEFAULT = 'default',
    PREVIEW = 'preview',
    TRAINING = 'training',
}

export const matchesProjectTypeFilter = (
    filter: ProjectTypeFilter,
    type: ProjectType,
): boolean => {
    switch (filter) {
        case ProjectTypeFilter.DEFAULT:
            return type === ProjectType.DEFAULT;
        case ProjectTypeFilter.PREVIEW:
            return type === ProjectType.PREVIEW;
        case ProjectTypeFilter.TRAINING:
            return type === ProjectType.TRAINING;
        case ProjectTypeFilter.ALL:
            return true;
        default:
            return assertUnreachable(filter, `Unknown filter: ${filter}`);
    }
};
