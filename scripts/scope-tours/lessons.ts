/**
 * Lessons are walkthroughs built from declarations rather than markers: a
 * developer lesson per semantic-layer docs page (sandboxLessons.ts) and a
 * content-as-code lesson per scope (codeLessons.ts), each from a fixed
 * template over the workspace page of a training copy. Hints and docs are
 * read the way marker tours read them, so a missing anchor or citation fails
 * the build.
 */
import {
    checkContentAsCodeEntry,
    friendlyName,
    getScopes,
} from '@lightdash/common';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildArgv } from '../../packages/backend/src/services/LearnSandboxService/allowlist';
import type { ContentAsCodeLesson } from '../../packages/frontend/src/features/learn/codeLessons';
import type {
    DocsCitation,
    SandboxLesson,
} from '../../packages/frontend/src/features/learn/sandboxLessons';
import { parseCommand } from '../../packages/frontend/src/features/learnSandbox/parseCommand';
import {
    insertionPoint,
    replaceLine,
} from '../../packages/frontend/src/features/learnSandbox/snippetInsertion';
import {
    buildTours,
    docsCardTitle,
    docsDir,
    docsHeading,
    docsParagraph,
    frontendSrc,
    hintFor,
    isInputAnchor,
    LESSON_SOURCE,
    listTsx,
    root,
    type ScopeTourBuild,
    type ScopeTourDefinition,
    type ScopeTourStepDefinition,
} from './lib';

const LESSON_ID = /^docs:[a-z0-9-]+(?:\/[a-z0-9-]+)+$/;
const WORKSPACE_ROUTE = '/projects/:projectUuid/learn/workspace';
const EXPLORE_ROUTE = '/projects/:projectUuid/tables/:tableName';
const BUSY_OUTPUT = '[data-tour-anchor="terminal-running"]';

const learnBundleFiles = (): Map<string, string> => {
    const bundle = JSON.parse(
        readFileSync(
            path.join(root, 'packages/backend/assets/learn/jaffle-dbt.json'),
            'utf8',
        ),
    ) as { files: { path: string; content: string }[] };
    return new Map(bundle.files.map((file) => [file.path, file.content]));
};

/**
 * Several citations read as one body: each is closed with a full stop when
 * the docs leave it open (a list item), then they are joined in order.
 */
const cite = (refs: DocsCitation): string =>
    (Array.isArray(refs) ? refs : [refs])
        .map((ref) => docsParagraph(ref))
        .map((text) => (/[.!?:]\**$/.test(text) ? text : `${text}.`))
        .join(' ');

const firstCitation = (refs: DocsCitation): string =>
    Array.isArray(refs) ? refs[0] : refs;

const article = (word: string) => (/^[aeiou]/.test(word) ? 'an' : 'a');

/** The key a snippet extends: its first line, `metrics:` or the like. */
const snippetKey = (snippet: string): string | undefined =>
    /^ *([^\s#-][^:]*):\s*$/.exec(snippet.split('\n')[0])?.[1];

/** The `type:` a lesson's snippet declares; the cards name it. */
const snippetMetricType = (snippet: string): string | undefined =>
    /^\s*type:\s*([a-z_]+)\s*$/m.exec(snippet)?.[1];

const validateLesson = (
    lesson: SandboxLesson,
    bundleFiles: Map<string, string>,
) => {
    const where = `${LESSON_SOURCE}: lesson ${lesson.id}`;
    if (!LESSON_ID.test(lesson.id)) {
        throw new Error(
            `${where}: id must look like docs:<docs path without .mdx>`,
        );
    }
    if (lesson.id !== `docs:${lesson.docs.replace(/\.mdx$/, '')}`) {
        throw new Error(`${where}: id and docs page disagree`);
    }
    if (!existsSync(path.join(docsDir, lesson.docs))) {
        throw new Error(
            `${where}: docs page ${lesson.docs} not found under ${docsDir}`,
        );
    }
    if (
        !/^models\/(?:[^/]+\/)*[^/]+\.yml$/.test(lesson.file) ||
        !bundleFiles.has(lesson.file)
    ) {
        throw new Error(
            `${where}: file must be an editable models/**/*.yml in the learn bundle`,
        );
    }
    if (
        lesson.column !== undefined &&
        (!/^[a-z][a-z0-9_]*$/.test(lesson.column) ||
            !new RegExp(`^\\s*- name: ${lesson.column}\\s*$`, 'm').test(
                bundleFiles.get(lesson.file)!,
            ))
    ) {
        throw new Error(
            `${where}: column ${lesson.column} is not a column of ${lesson.file}`,
        );
    }
    if (lesson.snippet.trim() === '')
        throw new Error(`${where}: snippet is empty`);
    const under = snippetKey(lesson.snippet);
    if (!under) {
        throw new Error(
            `${where}: snippet must start with the key it extends (metrics:, additional_dimensions:)`,
        );
    }
    if (lesson.column !== undefined && !snippetMetricType(lesson.snippet)) {
        throw new Error(`${where}: snippet declares no type`);
    }
    if (
        lesson.column === undefined &&
        !new RegExp(`^\\s*- name: ${lesson.result.field}\\s*$`, 'm').test(
            lesson.snippet,
        )
    ) {
        throw new Error(
            `${where}: a snippet that extends the model must declare the column entry "- name: ${lesson.result.field}"`,
        );
    }
    // The snippet's children land directly under the last line that is
    // that key; it has to belong to the declared column, or the cards would
    // name one column and the snippet extend another.
    const content = bundleFiles.get(lesson.file)!;
    const point = insertionPoint(content, lesson.snippet);
    if (point.parentLine === null || point.text === lesson.snippet) {
        throw new Error(
            `${where}: ${lesson.file} has no ${under}: key for the snippet to extend`,
        );
    }
    const owner = content
        .split('\n')
        .slice(0, point.parentLine)
        .reverse()
        .map((line) => /^\s*- name: ([a-z0-9_]+)\s*$/.exec(line)?.[1])
        .find((name) => name !== undefined);
    // A column lesson's key belongs to that column; a model lesson's key
    // (`columns:`) belongs to the model the explore is named after.
    const expectedOwner = lesson.column ?? lesson.result.explore;
    if (owner !== expectedOwner) {
        throw new Error(
            `${where}: the last ${under}: key of ${lesson.file} belongs to ${owner ?? 'nothing named'}, not ${expectedOwner}`,
        );
    }
    const [tool] = lesson.command.trim().split(/\s+/);
    if (tool !== 'lightdash' && tool !== 'dbt') {
        throw new Error(`${where}: command must start with lightdash or dbt`);
    }
    for (const name of [lesson.result.explore, lesson.result.field]) {
        if (!/^[a-z][a-z0-9_]*$/.test(name)) {
            throw new Error(
                `${where}: result names must be dbt names (${name})`,
            );
        }
    }
};

const click = (
    target: string,
    route: string,
    title: string,
    via: string[],
): ScopeTourStepDefinition => ({
    target,
    route,
    title,
    body: '',
    interactive: true,
    advanceOnTargetClick: true,
    advanceOnTargetInput: false,
    via,
});

const typed = (
    target: string,
    route: string,
    title: string,
    body: string,
    suggestion: string,
    via: string[],
    suggestionContextLines = 0,
): ScopeTourStepDefinition => ({
    target,
    route,
    title,
    body,
    interactive: true,
    advanceOnTargetClick: false,
    advanceOnTargetInput: true,
    via,
    suggestion,
    ...(suggestionContextLines > 0 ? { suggestionContextLines } : {}),
});

const look = (
    target: string | null,
    route: string,
    title: string,
    body: string,
    via: string[],
    busy?: string,
): ScopeTourStepDefinition => ({
    target,
    route,
    title,
    body,
    interactive: false,
    advanceOnTargetClick: false,
    advanceOnTargetInput: false,
    via,
    ...(busy ? { busy } : {}),
});

/**
 * One tour per lesson from a fixed template: read the docs, open the file,
 * append the snippet, type the command, run it, watch the output, then open
 * the explore and find the new field. Hints and docs are read the way marker
 * tours read them, so a missing anchor or citation fails the build.
 */
export const buildLessonTours = (
    lessons: SandboxLesson[],
    files: string[],
): ScopeTourDefinition[] => {
    if (lessons.length === 0) return [];
    const seen = new Set<string>();
    lessons.forEach(({ id }) => {
        if (seen.has(id)) {
            throw new Error(`${LESSON_SOURCE}: duplicate lesson id ${id}`);
        }
        seen.add(id);
    });
    const bundleFiles = learnBundleFiles();
    return lessons.map((lesson) => {
        validateLesson(lesson, bundleFiles);
        const metricType = snippetMetricType(lesson.snippet);
        const under = snippetKey(lesson.snippet)!;
        const fileRow = `[data-tour-anchor="workspace-file"][data-tour-value="${lesson.file}"]`;
        const editor = '[data-tour-anchor="workspace-editor"]';
        const command = '[data-tour-anchor="terminal-command"]';
        const run = '[data-tour-anchor="terminal-run"]';
        const output = '[data-learn-terminal-output]';
        const newMenu = '[data-tour-nav="new"]';
        const newChart = '[data-tour-nav="new-chart"]';
        const exploreLabel = friendlyName(lesson.result.explore);
        const fieldLabel = friendlyName(lesson.result.field);
        const table = `[data-tour-anchor="explore-table"][data-tour-value="${exploreLabel}"]`;
        const search = '[data-tour-anchor="explore-search"]';
        const fieldSearch = '[data-tour-anchor="explore-field-search"]';
        const fieldRow = `[data-tour-anchor="explore-${lesson.result.kind}"][data-tour-value="${fieldLabel}"]`;
        for (const selector of [editor, command, search, fieldSearch]) {
            if (!isInputAnchor(selector, files)) {
                throw new Error(
                    `${LESSON_SOURCE}: ${selector} must be a typed anchor (data-tour-input)`,
                );
            }
        }
        const title = docsCardTitle(lesson.docs);
        const steps: ScopeTourStepDefinition[] = [
            look(
                // The intro explains the page's concept before any control is named.
                null,
                WORKSPACE_ROUTE,
                title,
                cite(lesson.intro),
                [],
            ),
            // The docs say where a metric lives; the editor step then says
            // which one this lesson adds. Its task sentence and the closing
            // one are the only fixed wording in a lesson besides 'See the
            // result'.
            {
                ...click(fileRow, WORKSPACE_ROUTE, hintFor(fileRow, files), []),
                body: cite(lesson.fileDocs),
            },
            {
                ...typed(
                    editor,
                    WORKSPACE_ROUTE,
                    hintFor(editor, files),
                    lesson.column !== undefined && metricType !== undefined
                        ? `${cite(lesson.snippetDocs)} Let's add **${lesson.result.field}**, ${article(metricType)} **${metricType}** ${lesson.result.kind} on the **${lesson.column}** column: it goes under that column's **${under}**. Add the highlighted lines under **${under}:**, or press Use it, then Check.`
                        : `${cite(lesson.snippetDocs)} Let's add **${lesson.result.field}** to the **${lesson.result.explore}** model's **${under}**. Add the highlighted lines under **${under}:**, or press Use it, then Check.`,
                    lesson.snippet,
                    [fileRow],
                    // The snippet's first line is the key it goes under, which
                    // the file already has: the card fades it.
                    1,
                ),
                // What Check looks for, as facts about the dbt project: the
                // learner's own placement, quoting and style all pass, and
                // the right entry under the wrong model or column does not.
                expect: {
                    model: lesson.result.explore,
                    ...(lesson.column !== undefined
                        ? { column: lesson.column }
                        : {}),
                    under,
                    field: lesson.result.field,
                },
            },
            typed(
                command,
                WORKSPACE_ROUTE,
                hintFor(command, files),
                cite(lesson.commandDocs),
                lesson.command,
                [fileRow],
            ),
            click(run, WORKSPACE_ROUTE, hintFor(run, files), [fileRow]),
            {
                ...look(
                    output,
                    WORKSPACE_ROUTE,
                    'See the result',
                    cite(lesson.outputDocs),
                    [],
                    BUSY_OUTPUT,
                ),
                // A failed run goes back to the editor (step 3), where the
                // file can be put right before the command is run again.
                retryStep: 2,
            },
            click(newMenu, WORKSPACE_ROUTE, hintFor(newMenu, files), []),
            click(newChart, WORKSPACE_ROUTE, hintFor(newChart, files), [
                newMenu,
            ]),
            // The table list is virtualised, so the lesson's table is not on
            // the page until it is searched for.
            typed(
                search,
                EXPLORE_ROUTE,
                hintFor(search, files),
                '',
                exploreLabel,
                [newMenu, newChart],
            ),
            click(table, EXPLORE_ROUTE, hintFor(table, files), [
                newMenu,
                newChart,
                search,
            ]),
            // The field tree has its own search, and the table list's has
            // gone by now: the explore replaces it. The search is titled from
            // the field row's own named hint, so the step and the row it
            // leads to say the same thing and a missing row fails the build.
            typed(
                fieldSearch,
                EXPLORE_ROUTE,
                hintFor(fieldRow, files),
                '',
                fieldLabel,
                [newMenu, newChart, search, table],
            ),
            look(
                fieldRow,
                EXPLORE_ROUTE,
                docsHeading(firstCitation(lesson.resultDocs)),
                `${cite(lesson.resultDocs)} **${fieldLabel}** is the ${lesson.result.kind} you just added.`,
                [newMenu, newChart, search, table, fieldSearch],
            ),
            // How the change reaches a team's real project (a pull request
            // and CI, outside Lightdash). The card stays on the new field:
            // a centred step would leave the ring behind on the row.
            ...(lesson.shipDocs
                ? [
                      look(
                          fieldRow,
                          EXPLORE_ROUTE,
                          docsHeading(firstCitation(lesson.shipDocs)),
                          cite(lesson.shipDocs),
                          [newMenu, newChart, search, table, fieldSearch],
                      ),
                  ]
                : []),
        ];
        return { scope: lesson.id, title, sources: [LESSON_SOURCE], steps };
    });
};


export const CODE_LESSON_SOURCE =
    'packages/frontend/src/features/learn/codeLessons.ts';
/** What `lightdash download` writes for a lesson's chart, one file per slug. */
export const CODE_LESSON_FIXTURES =
    'scripts/scope-tours/fixtures/code-lessons';
const SAVED_CHARTS_ROUTE = '/projects/:projectUuid/saved';

/**
 * The committed copy of what `lightdash download --charts <chart>` writes for
 * a seeded chart in a training copy (refresh-code-fixture.ts captures it);
 * undefined when there is none.
 */
export const downloadFixture = (chart: string): string | undefined => {
    const file = path.join(root, CODE_LESSON_FIXTURES, `${chart}.yml`);
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
};

/** Seeded chart names by slug, from the playground bundle every copy is seeded from. */
export const bundleCharts = (): Map<string, string> => {
    const content = JSON.parse(
        readFileSync(
            path.join(root, 'packages/backend/assets/playground/content.json'),
            'utf8',
        ),
    ) as { charts: { slug: string; name: string }[] };
    return new Map(content.charts.map((chart) => [chart.slug, chart.name]));
};

/** The argv the sandbox would run for a typed command, or null when the terminal refuses it. */
const sandboxArgv = (command: string): string[] | null => {
    const request = parseCommand(command);
    if ('error' in request) return null;
    const built = buildArgv(request, '/workspace');
    return built.ok ? built.argv : null;
};

/** The chart slugs an argv names after `-c`/`--charts`. */
const chartsIn = (argv: string[]): string[] => {
    const slugs: string[] = [];
    let inCharts = false;
    argv.forEach((arg) => {
        if (arg.startsWith('-')) inCharts = arg === '-c' || arg === '--charts';
        else if (inCharts) slugs.push(arg);
    });
    return slugs;
};

/**
 * A plain `name: <value>` line, which is all a lesson's edit may be. The
 * name ends up in an attribute selector (the chart's row), so it carries no
 * quote or backslash.
 */
const NAME_LINE = /^name: ([^\s'"#\\][^#\n"\\]*?)\s*$/;

const validateCodeLesson = (
    lesson: ContentAsCodeLesson,
    lessons: ContentAsCodeLesson[],
    charts: Map<string, string>,
) => {
    const where = `${CODE_LESSON_SOURCE}: lesson ${lesson.scope}`;
    if (!getScopes({ isEnterprise: true }).some((s) => s.name === lesson.scope))
        throw new Error(`${where}: unknown scope`);
    if (lesson.title.trim() === '') throw new Error(`${where}: title is empty`);
    if (!charts.has(lesson.chart)) {
        throw new Error(
            `${where}: chart ${lesson.chart} is not a seeded chart (playground content.json)`,
        );
    }
    const commandFor = (command: string, subcommand: string) => {
        const argv = sandboxArgv(command);
        if (!argv) {
            throw new Error(
                `${where}: the Learn terminal refuses "${command}"`,
            );
        }
        if (argv[0] !== 'lightdash' || argv[1] !== subcommand) {
            throw new Error(
                `${where}: "${command}" must be lightdash ${subcommand}`,
            );
        }
        if (!chartsIn(argv).includes(lesson.chart)) {
            throw new Error(
                `${where}: "${command}" must name the chart (--charts ${lesson.chart})`,
            );
        }
    };
    commandFor(lesson.download.command, 'download');
    const { taughtIn } = lesson.download;
    if (taughtIn !== undefined) {
        const teacher = lessons.find((other) => other.scope === taughtIn);
        if (
            !teacher ||
            teacher === lesson ||
            teacher.download.taughtIn !== undefined ||
            teacher.download.command !== lesson.download.command
        ) {
            throw new Error(
                `${where}: taughtIn must name another lesson that teaches the same download`,
            );
        }
        if (lesson.download.docs || lesson.download.outputDocs) {
            throw new Error(
                `${where}: a download taught elsewhere is not explained again`,
            );
        }
    } else if (!lesson.download.docs || !lesson.download.outputDocs) {
        throw new Error(`${where}: the download needs docs and outputDocs`);
    }
    if ((lesson.edit === undefined) !== (lesson.upload === undefined)) {
        throw new Error(`${where}: an edit and an upload come together`);
    }
    if (lesson.edit) {
        const to = NAME_LINE.exec(lesson.edit.to)?.[1];
        if (!NAME_LINE.test(lesson.edit.from) || to === undefined) {
            throw new Error(
                `${where}: an edit changes the chart's plain name: line`,
            );
        }
        const fixture = downloadFixture(lesson.chart);
        if (fixture === undefined) {
            throw new Error(
                `${where}: no download fixture for ${lesson.chart} in ${CODE_LESSON_FIXTURES} (run pnpm scope-tours:refresh-code-fixture)`,
            );
        }
        if (!fixture.split('\n').includes(lesson.edit.from)) {
            throw new Error(
                `${where}: the downloaded file has no line "${lesson.edit.from}"`,
            );
        }
        // What Use it leaves passes Check, and the file as downloaded does
        // not: the step can be completed, and cannot be skipped.
        const expected = { slug: lesson.chart, name: to };
        if (
            checkContentAsCodeEntry(
                replaceLine(fixture, lesson.edit.to),
                expected,
            ) !== null ||
            checkContentAsCodeEntry(fixture, expected) === null
        ) {
            throw new Error(
                `${where}: "${lesson.edit.to}" does not turn the downloaded file into one Check accepts`,
            );
        }
    }
    if (lesson.upload) commandFor(lesson.upload.command, 'upload');
};

/**
 * One tour per content-as-code lesson, from a fixed template: an intro, then
 * type the download, run it and watch the output (or, for a download another
 * lesson teaches, one card naming that lesson), then open the file it wrote.
 * Without an edit the lesson ends on a look at the file. With one, Use it
 * replaces the chart's name line and Check must pass; then type the upload,
 * run it, watch the output, and find the chart under its new name in All
 * saved charts.
 */
export const buildContentAsCodeTours = (
    lessons: ContentAsCodeLesson[],
    files: string[],
): ScopeTourDefinition[] => {
    if (lessons.length === 0) return [];
    const seen = new Set<string>();
    lessons.forEach(({ scope }) => {
        if (seen.has(scope)) {
            throw new Error(
                `${CODE_LESSON_SOURCE}: duplicate lesson for ${scope}`,
            );
        }
        seen.add(scope);
    });
    const charts = bundleCharts();
    const command = '[data-tour-anchor="terminal-command"]';
    const run = '[data-tour-anchor="terminal-run"]';
    const output = '[data-learn-terminal-output]';
    const editor = '[data-tour-anchor="workspace-editor"]';
    const browse = '[data-tour-nav="browse"]';
    const allCharts = '[data-tour-nav="all-charts"]';
    for (const selector of [command, editor]) {
        if (!isInputAnchor(selector, files)) {
            throw new Error(
                `${CODE_LESSON_SOURCE}: ${selector} must be a typed anchor (data-tour-input)`,
            );
        }
    }
    return lessons.map((lesson) => {
        validateCodeLesson(lesson, lessons, charts);
        const fileRow = `[data-tour-anchor="workspace-file"][data-tour-value="lightdash/charts/${lesson.chart}.yml"]`;
        const { taughtIn } = lesson.download;
        const steps: ScopeTourStepDefinition[] = [
            look(null, WORKSPACE_ROUTE, lesson.title, cite(lesson.intro), []),
        ];
        if (taughtIn === undefined) {
            steps.push(
                typed(
                    command,
                    WORKSPACE_ROUTE,
                    hintFor(command, files),
                    cite(lesson.download.docs!),
                    lesson.download.command,
                    [],
                ),
                click(run, WORKSPACE_ROUTE, hintFor(run, files), []),
                {
                    ...look(
                        output,
                        WORKSPACE_ROUTE,
                        'See the result',
                        cite(lesson.download.outputDocs!),
                        [],
                        BUSY_OUTPUT,
                    ),
                    // A failed download goes back to the command.
                    retryStep: 1,
                },
                click(fileRow, WORKSPACE_ROUTE, hintFor(fileRow, files), []),
            );
        } else {
            const teacher = lessons.find((other) => other.scope === taughtIn)!;
            steps.push(
                // The bridge: the one card of the download, naming the lesson
                // that explains it.
                typed(
                    command,
                    WORKSPACE_ROUTE,
                    hintFor(command, files),
                    `First download the chart, as in **${teacher.title}**.`,
                    lesson.download.command,
                    [],
                ),
                click(run, WORKSPACE_ROUTE, hintFor(run, files), []),
                // The file appears once the download is done; until then the
                // running terminal is spotlit.
                {
                    ...click(
                        fileRow,
                        WORKSPACE_ROUTE,
                        hintFor(fileRow, files),
                        [],
                    ),
                    busy: BUSY_OUTPUT,
                },
            );
        }
        if (!lesson.edit || !lesson.upload) {
            steps.push(
                look(
                    editor,
                    WORKSPACE_ROUTE,
                    docsHeading(firstCitation(lesson.resultDocs)),
                    cite(lesson.resultDocs),
                    [fileRow],
                ),
            );
            return {
                scope: lesson.scope,
                title: lesson.title,
                sources: [CODE_LESSON_SOURCE],
                steps,
            };
        }
        const name = NAME_LINE.exec(lesson.edit.to)![1];
        const editStep = steps.length;
        steps.push(
            {
                ...typed(
                    editor,
                    WORKSPACE_ROUTE,
                    hintFor(editor, files),
                    `${lesson.edit.docs ? `${cite(lesson.edit.docs)} ` : ''}Let's rename the chart to **${name}**: change its **name** and keep its **slug**, which upload finds the chart by. Change the **name:** line to the highlighted one, or press Use it, then Check.`,
                    lesson.edit.to,
                    [fileRow],
                ),
                // What Check tests the file for (checkContentAsCodeEntry):
                // the slug as downloaded and the new name.
                expect: {
                    kind: 'contentAsCode',
                    slug: lesson.chart,
                    name,
                },
            },
            typed(
                command,
                WORKSPACE_ROUTE,
                hintFor(command, files),
                cite(lesson.upload.docs),
                lesson.upload.command,
                [fileRow],
            ),
            {
                ...click(run, WORKSPACE_ROUTE, hintFor(run, files), [fileRow]),
                body: lesson.upload.runDocs ? cite(lesson.upload.runDocs) : '',
            },
            {
                ...look(
                    output,
                    WORKSPACE_ROUTE,
                    'See the result',
                    cite(lesson.upload.outputDocs),
                    [],
                    BUSY_OUTPUT,
                ),
                // A failed upload goes back to the file, where the edit can be
                // put right before the command is run again.
                retryStep: editStep,
            },
            click(browse, WORKSPACE_ROUTE, hintFor(browse, files), []),
            click(allCharts, WORKSPACE_ROUTE, hintFor(allCharts, files), [
                browse,
            ]),
            look(
                `[data-tour-anchor="chart-row"][data-tour-value="${name}"]`,
                SAVED_CHARTS_ROUTE,
                docsHeading(firstCitation(lesson.resultDocs)),
                cite(lesson.resultDocs),
                [browse, allCharts],
            ),
        );
        return {
            scope: lesson.scope,
            title: lesson.title,
            sources: [CODE_LESSON_SOURCE],
            steps,
        };
    });
};

/**
 * Every walkthrough: the markers', one per developer lesson and one per
 * content-as-code lesson. A content-as-code lesson is its scope's
 * walkthrough, so the markers must not describe one for it as well.
 */
export const buildAllTours = (
    files: string[] = listTsx(frontendSrc),
    lessons: SandboxLesson[] = [],
    codeLessons: ContentAsCodeLesson[] = [],
): ScopeTourBuild => {
    const build = buildTours(files);
    const codeTours = buildContentAsCodeTours(codeLessons, build.files);
    codeTours.forEach(({ scope }) => {
        if (build.tours.some((tour) => tour.scope === scope)) {
            throw new Error(
                `${CODE_LESSON_SOURCE}: ${scope} already has a walkthrough from markers`,
            );
        }
    });
    return {
        ...build,
        tours: [
            ...build.tours,
            ...buildLessonTours(lessons, build.files),
            ...codeTours,
        ],
    };
};
