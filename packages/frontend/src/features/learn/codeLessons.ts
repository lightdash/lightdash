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

const PAGE = 'workflow/content-as-code.mdx';
const DOWNLOAD = 'lightdash download --charts revenue-by-payment-method';

// Read by the walkthrough generator and checker (scripts/scope-tours).
// ts-unused-exports:disable-next-line
export const CONTENT_AS_CODE_LESSONS: ContentAsCodeLesson[] = [
    {
        scope: 'view:ContentAsCode',
        title: 'Download a chart as code',
        chart: 'revenue-by-payment-method',
        intro: `${PAGE}#disposable-editing-recommended:1`,
        download: {
            command: DOWNLOAD,
            docs: [
                `${PAGE}#lightdash-download:1`,
                // The heading's slug keeps the flags' hyphens; sections split
                // at every heading level, so this H5 owns the sentence.
                `${PAGE}#use-lightdash-download--c-or-lightdash-download---charts-to-select-specific-charts:1`,
            ],
            // Where the files went: the page's sentence about "all of the
            // charts and dashboards" would misdescribe a one-chart download.
            outputDocs: `${PAGE}#specify-a-download-path:p2:1`,
        },
        resultDocs: `${PAGE}#disposable-editing-recommended:2`,
    },
    {
        scope: 'create:ContentAsCode',
        title: 'Change a chart in code and upload it',
        chart: 'revenue-by-payment-method',
        intro: `${PAGE}#lightdash-upload:p2:1`,
        download: { command: DOWNLOAD, taughtIn: 'view:ContentAsCode' },
        edit: {
            from: 'name: Revenue by payment method',
            to: 'name: Revenue by payment type',
            docs: `${PAGE}#making-changes:li3:1`,
        },
        upload: {
            // --force: each sandbox command rebuilds its files, so the CLI's
            // change detection cannot tell an edit from a fresh copy; the
            // docs' own workflow runs it too.
            command:
                'lightdash upload --force --charts revenue-by-payment-method',
            docs: [
                // The docs' step that runs this very command: the learner's
                // copy is the preview environment it speaks of.
                `${PAGE}#making-changes:li4`,
                // p3: the docs' code example counts as the section's p2.
                `${PAGE}#use-lightdash-upload--c-or-lightdash-upload---charts-to-select-specific-charts:p3:1`,
            ],
            outputDocs: `${PAGE}#lightdash-upload:1`,
        },
        // What the learner has just done from end to end.
        resultDocs: `${PAGE}#disposable-editing-recommended:1-2`,
    },
];

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
