import type {
    LearnAskMatch as CommonAskMatch,
    LearnCatalogue as CommonCatalogue,
    LearnCatalogueEntry as CommonEntry,
    LearnCourse as CommonCourse,
    LearnCourseProgress as CommonProgress,
    LearnEventInput as CommonEvent,
} from '@lightdash/common';
import { LEARN_ASK_QUERY_MAX_LENGTH } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { ASK_QUERY_MAX_LENGTH, type LearnAskMatch } from './ask';
import type { LearnCatalogue, LearnCatalogueEntry } from './catalogue';
import type { LearnCourse } from './course';
import type { LearnCourseProgress, LearnEventInput } from './progress';

// Common's zod-parsed types are the wire contract; the package types are the
// subset the UI reads. If common drops or renames a field the UI depends on,
// one of these assignments stops compiling.
const entry = (e: CommonEntry): LearnCatalogueEntry => e;
const catalogue = (c: CommonCatalogue): LearnCatalogue => c;
const course = (c: CommonCourse): LearnCourse => c;
const match = (m: CommonAskMatch): LearnAskMatch => m;
const progress = (p: CommonProgress): LearnCourseProgress => p;
const event = (e: CommonEvent): LearnEventInput => e;

describe('type assignability from @lightdash/common', () => {
    it('compiles', () => {
        expect([entry, catalogue, course, match, progress, event]).toHaveLength(
            6,
        );
    });
    it('ask query limit matches the backend limit', () => {
        expect(ASK_QUERY_MAX_LENGTH).toBe(LEARN_ASK_QUERY_MAX_LENGTH);
    });
});
