/**
 * Developer lessons: one per semantic-layer docs page, practised in the
 * workspace of a training copy. The generator (scripts/scope-tours/lib.ts,
 * buildLessonTours) turns each entry into a tour under its id; the catalogue
 * lists each as a `docs` module in the Developer group. Only the snippet is
 * authored here; every sentence the learner reads is a cited docs sentence.
 *
 * The snippet is appended to the END of `file` by the editor's tour hook, so
 * it must be indented to extend the mapping the file ends in. The lesson
 * compile test (scripts/playground-bundle/learnLessons.test.ts) proves it.
 */
export type SandboxLesson = {
    /** `docs:<page path without .mdx>`; doubles as the module and tour key. */
    id: `docs:${string}`;
    /** The page the card and the intro cite. */
    docs: string;
    /** Citation for the intro step. */
    intro: string;
    /** Workspace file the tour opens: a model yml in the bundle. */
    file: string;
    /** Appended by "Use it"; must extend the file's last mapping. */
    snippet: string;
    /** Citation shown with the editor step. */
    snippetDocs: string;
    /** What the tour types into the terminal. */
    command: string;
    /** Citation shown with the command step. */
    commandDocs: string;
    /** Citation shown while the command runs. */
    outputDocs: string;
    /** The explore name and field name the learner ends on, not their ids. */
    result: { explore: string; field: string };
    /** Citation on the final look. */
    resultDocs: string;
};

export const SANDBOX_LESSONS: SandboxLesson[] = [
    {
        id: 'docs:semantic-layer/metrics',
        docs: 'semantic-layer/metrics.mdx',
        intro: 'semantic-layer/metrics.mdx#intro:1-2',
        file: 'models/payments.yml',
        snippet: [
            '              average_payment_amount:',
            '                type: average',
        ].join('\n'),
        snippetDocs: 'semantic-layer/metrics.mdx#average:1-2',
        command: 'lightdash deploy',
        commandDocs: 'workflow/cli/deploy.mdx#intro:1',
        outputDocs: 'workflow/cli/deploy.mdx#option-1-deploy-via-the-cli:li3',
        result: { explore: 'payments', field: 'average_payment_amount' },
        resultDocs: 'semantic-layer/metrics.mdx#1-using-the-column-meta-tag:1',
    },
];
