import { ProjectType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    matchesProjectTypeFilter,
    ProjectTypeFilter,
} from './projectTypeFilter';

describe('project management type filter', () => {
    it('shows every type under All, the training playground included', () => {
        Object.values(ProjectType).forEach((type) => {
            expect(matchesProjectTypeFilter(ProjectTypeFilter.ALL, type)).toBe(
                true,
            );
        });
    });

    it('shows only the training playground under Training', () => {
        expect(
            matchesProjectTypeFilter(
                ProjectTypeFilter.TRAINING,
                ProjectType.TRAINING,
            ),
        ).toBe(true);
        expect(
            matchesProjectTypeFilter(
                ProjectTypeFilter.TRAINING,
                ProjectType.DEFAULT,
            ),
        ).toBe(false);
        expect(
            matchesProjectTypeFilter(
                ProjectTypeFilter.TRAINING,
                ProjectType.PREVIEW,
            ),
        ).toBe(false);
    });

    it('keeps the training playground out of Projects and Preview', () => {
        expect(
            matchesProjectTypeFilter(
                ProjectTypeFilter.DEFAULT,
                ProjectType.TRAINING,
            ),
        ).toBe(false);
        expect(
            matchesProjectTypeFilter(
                ProjectTypeFilter.PREVIEW,
                ProjectType.TRAINING,
            ),
        ).toBe(false);
    });
});
