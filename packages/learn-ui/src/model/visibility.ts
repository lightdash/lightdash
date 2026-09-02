/**
 * CS-169 per-lesson scope visibility. Shared by the in-app Learn section and
 * learn.lightdash.com via @lightdash/learn-ui. The panel maps catalogue
 * entries through `effectiveEntry` BEFORE handing them to railModel /
 * moduleProgress / lessonCount renders, so all board math sees visible
 * counts without the twin model changing.
 *
 * Visibility rule mirrors `model.ts` `isUnlocked`: a null/untagged
 * lesson is always visible, and a scope whose base the scope registry does
 * not know is always visible (forward compat — an unknown scope never hides
 * content).
 */
import { holds, parseScopeTag, type BoardModel } from './model';

export type VisibilityModel = {
    lessonVisible: (
        scope: string | null | undefined,
        held: string[],
    ) => boolean;
    visibleLessonCount: (entry: CountableEntry, held: string[]) => number;
    effectiveEntry: <T extends CountableEntry>(entry: T, held: string[]) => T;
    filterCourseForScopes: <T extends FilterableCourse>(
        course: T,
        held: string[],
    ) => T;
    effectiveRollup: <
        R extends {
            completed: boolean;
            passed: boolean;
            lessonsCompleted: Set<string>;
        },
    >(
        entry: CountableEntry,
        rollup: R | undefined,
        held: string[],
    ) => R | undefined;
};

export type CountableEntry = {
    lessonCount: number;
    lessonScopes?: (string | null)[];
};

export type FilterableCourse = {
    lessons: { id: string; scope?: string | null }[];
    quiz: { questions: { id: string; lesson?: string }[] };
};

export const createVisibilityModel = (board: BoardModel): VisibilityModel => {
    /**
     * Whether a lesson with this scope tag is visible to a learner holding
     * `held`. null/undefined (untagged, or published before the field existed)
     * and unknown-base tags are always visible, matching isUnlocked's
     * forward-compat rule; otherwise the same holds() predicate the board uses
     * for modules.
     */
    const lessonVisible = (
        scope: string | null | undefined,
        held: string[],
    ): boolean => {
        if (scope === null || scope === undefined) return true;
        const { base } = parseScopeTag(scope);
        if (!board.scopeKnown(base)) return true;
        return holds(held, scope);
    };

    /**
     * How many of the entry's lessons are visible to `held`. Derived from
     * `lessonScopes` when the catalogue carries it (one tag per lesson, in
     * lesson order); a pre-CS-169 catalogue has no per-lesson data, so the full
     * lessonCount stands.
     */
    const visibleLessonCount = (
        entry: CountableEntry,
        held: string[],
    ): number => {
        if (!entry.lessonScopes) return entry.lessonCount;
        return entry.lessonScopes.filter((scope) => lessonVisible(scope, held))
            .length;
    };

    /**
     * The entry with `lessonCount` replaced by the visible-lesson count. The
     * panel maps entries through this before every model call and every
     * lessonCount render, which is what keeps the board model byte-identical
     * while its denominators become visible counts.
     */
    const effectiveEntry = <T extends CountableEntry>(
        entry: T,
        held: string[],
    ): T => {
        if (!entry.lessonScopes) return entry;
        return { ...entry, lessonCount: visibleLessonCount(entry, held) };
    };

    /**
     * The course with hidden lessons removed and the quiz filtered to questions
     * whose `lesson` stem names a visible lesson (questions without a lesson key
     * are kept — legacy quizzes predate the key, which reaches us through the
     * schema's passthrough). Must run on the course object BEFORE the player
     * builds its index-parallel answers array.
     */
    const filterCourseForScopes = <T extends FilterableCourse>(
        course: T,
        held: string[],
    ): T => {
        const lessons = course.lessons.filter((lesson) =>
            lessonVisible(lesson.scope, held),
        );
        if (lessons.length === course.lessons.length) return course;
        const visibleIds = new Set(lessons.map((lesson) => lesson.id));
        const questions = course.quiz.questions.filter(
            (q) => q.lesson === undefined || visibleIds.has(q.lesson),
        );
        return { ...course, lessons, quiz: { ...course.quiz, questions } };
    };

    /**
     * Display-state derivation for a rollup against the currently visible lesson
     * set (CS-169 §6: module "completed" is derived — a role change that unlocks
     * new lessons re-opens the module, "2 of 3, new lessons unlocked"). The quiz
     * pass and the completed event stay durable facts in the raw rollup; only
     * the card/board doneness is derived here. Count-compare is exact for role
     * upgrades because system role scope sets nest (previously visible lessons
     * are a subset of now-visible ones); on a downgrade the completed size
     * exceeds the visible count and the module stays done — the learner
     * finished everything their role can see.
     */
    const effectiveRollup = <
        R extends {
            completed: boolean;
            passed: boolean;
            lessonsCompleted: Set<string>;
        },
    >(
        entry: CountableEntry,
        rollup: R | undefined,
        held: string[],
    ): R | undefined => {
        // Legacy (pre-CS-169) entry: no per-lesson data, nothing to derive from.
        if (!entry.lessonScopes) return rollup;
        if (!rollup || (!rollup.completed && !rollup.passed)) return rollup;
        // Covers downgrades and not-held modules (visible count 0): everything
        // the role can see is finished, so the module stays done.
        if (rollup.lessonsCompleted.size >= visibleLessonCount(entry, held))
            return rollup;
        // Derived copy only — the raw rollup (and server tiers) keep the durable
        // quiz-pass and completed facts.
        return { ...rollup, completed: false, passed: false };
    };

    return {
        lessonVisible,
        visibleLessonCount,
        effectiveEntry,
        filterCourseForScopes,
        effectiveRollup,
    };
};
