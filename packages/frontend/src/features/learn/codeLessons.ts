import type { DocsCitation } from './sandboxLessons';

/**
 * Content-as-code lessons (CS-283), practised in the developer sandbox of a
 * training copy: download a seeded chart as code and, optionally, change one
 * line of it and upload it back. A lesson is the walkthrough for the scope it
 * teaches, so it takes that scope's card out of Coming Soon. Its tour comes
 * from a fixed template (scripts/scope-tours/lessons.ts) in which every step
 * is a highlighted control or a look that cites the docs, and a missing
 * chart, a command the terminal would refuse or a line the downloaded file
 * does not have fails the build.
 */
export type ContentAsCodeLesson = {
    /** The ContentAsCode scope the lesson teaches; its card and walkthrough go by it. */
    scope: string;
    /** The card's title. */
    title: string;
    /** Slug of the seeded chart the lesson works on (the playground bundle's content.json). */
    chart: string;
    /** The opening look, before any control is named. */
    intro: DocsCitation;
    download: {
        command: string;
        /** On the step that types the command: what it does. */
        docs?: DocsCitation;
        /** On the look at its output: what it wrote. */
        outputDocs?: DocsCitation;
        /**
         * The scope of the lesson, declared before this one, that teaches
         * this download. The command is run on the way under a card that
         * names that lesson, and its output step shows that lesson's
         * sentence: nothing is explained again.
         */
        taughtIn?: string;
    };
    /**
     * The one line of the downloaded file the learner changes: the chart's
     * top-level `name:`, as the download writes it (`from`) and as it should
     * read (`to`). A lesson with an edit uploads it.
     */
    edit?: { from: string; to: string; docs?: DocsCitation };
    upload?: {
        command: string;
        /** On the step that types the command: what it does, flags included. */
        docs: DocsCitation;
        /** On the look at its output. */
        outputDocs: DocsCitation;
    };
    /**
     * The closing look: on the file in the editor when nothing is uploaded,
     * else on the chart's row, under its new name, in All saved charts.
     */
    resultDocs: DocsCitation;
};

// Read by the walkthrough generator and checker (scripts/scope-tours).
// ts-unused-exports:disable-next-line
export const CONTENT_AS_CODE_LESSONS: ContentAsCodeLesson[] = [];

/**
 * Where a scope's lesson sits among the content-as-code lessons, in the
 * order they are declared (a lesson's teacher comes before it); -1 when the
 * scope has none.
 */
export const codeLessonIndex = (scope: string): number =>
    CONTENT_AS_CODE_LESSONS.findIndex((lesson) => lesson.scope === scope);

/** Whether a scope's walkthrough is a content-as-code lesson. */
export const hasCodeLesson = (scope: string): boolean =>
    codeLessonIndex(scope) !== -1;

const subjectOf = (scope: string) => scope.split(':')[1]?.split('@')[0];

/**
 * Whether a scope shares its subject with a content-as-code lesson. Its card
 * sits with those lessons whether or not it has one yet, so a module still
 * to come is not left in another section as if it were something else.
 */
export const sitsWithCodeLessons = (scope: string): boolean =>
    CONTENT_AS_CODE_LESSONS.some(
        (lesson) => subjectOf(lesson.scope) === subjectOf(scope),
    );
