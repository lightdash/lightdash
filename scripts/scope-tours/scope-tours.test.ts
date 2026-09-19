/**
 * Generation checks for scope walkthroughs (CS-209). Fixtures are written to
 * a temp directory: a small "frontend" with markers and anchors, and a docs
 * page they cite. Run with `npx tsx scripts/scope-tours.test.ts`.
 */
import * as assert from 'assert';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const fixtures = mkdtempSync(path.join(tmpdir(), 'scope-tours-'));
const docs = path.join(fixtures, 'docs');
const app = path.join(fixtures, 'app');
mkdirSync(path.join(docs, 'explore'), { recursive: true });
mkdirSync(app, { recursive: true });
process.env.LIGHTDASH_DOCS_DIR = docs;

writeFileSync(
    path.join(docs, 'explore/homepage.mdx'),
    `---
title: Homepage
---

## Pin content

Users with **Manage pinned items** can pin content. Select **Pin to homepage** from the menu. Pinned items show at the top, as \`\${table.field}\` does. See [sharing](#sharing) or the [\`\`spaces page\`\`](/explore/spaces.mdx) for who can see it. ***Editors and above*** can pin, and *only* they can unpin.

- **Bullet one** - first item
- **Bullet two** - second item

## Name it

Give it a memorable name

## Escapes

Open **Settings \\> My apps** to see it.
`,
);

const nav = (hint: string | null) => `
export const Nav = () => (
    <Button
        data-tour-nav="browse"${hint === null ? '' : `\n        data-tour-hint="${hint}"`}
    >
        Browse
    </Button>
);
export const Home = () => (
    <a data-tour-nav="home" data-tour-hint="Go home">
        Home
    </a>
);
`;
const marker = (docsRef: string, extra = '') => `
export const Pin = () => (
    <Menu.Item
        data-tour-scope="manage:PinnedItems"
        data-tour-step="2"
        data-tour-route="/projects/:projectUuid/spaces"
        data-tour-label="Click Pin to homepage"
        data-tour-interactive="true"
        data-tour-via='[data-tour-nav="browse"]'
        data-tour-docs="${docsRef}"${extra}
    >
        Pin to homepage
    </Menu.Item>
);
export const Panel = () => (
    <Box
        data-tour-scope="manage:PinnedItems"
        data-tour-step="1"
        data-tour-route="/projects/:projectUuid/home"
        data-tour-label="Pinned content appears on the homepage"
        data-tour-docs="explore/homepage.mdx#pin-content:1"
        data-tour-resultdocs="explore/homepage.mdx#pin-content:3"
    />
);
`;

const write = (name: string, source: string) => {
    const file = path.join(app, name);
    writeFileSync(file, source);
    return file;
};

writeFileSync(
    path.join(docs, 'explore/explore-view.mdx'),
    `---
title: The Explore view
---

## The Explore page

The Explore page is made up of five areas:

1. **Metrics and dimensions** available on the table you selected
2. **Filters**, which restrict the data in your query
`,
);
mkdirSync(path.join(docs, 'semantic-layer'), { recursive: true });
mkdirSync(path.join(docs, 'workflow/cli'), { recursive: true });
writeFileSync(
    path.join(docs, 'semantic-layer/metrics.mdx'),
    `---
title: "Metrics reference"
sidebarTitle: "Metrics"
---

import LiquidTemplating from '/snippets/liquid-templating.mdx';

A metric is a value that describes or summarizes features from a collection of data points. For example: count of total number of user IDs, or sum of revenue.

In Lightdash, metrics are used to summarize dimensions or, sometimes, other metrics.

## Adding metrics to your project using the \`meta\` tag.

### 1. Using the column \`meta\` tag

To add a metric to Lightdash using the \`meta\` tag, you define it in your dbt project under the dimension name you're trying to describe/summarize.

### average

Takes the average (mean) of the values in the given field. Like SQL's \`AVG\` function.

The \`average\` metric can be used on any numeric dimension or, [for custom SQL](#using-custom-SQL-in-aggregate-metrics), any valid SQL expression that gives a numeric table column.
`,
);
writeFileSync(
    path.join(docs, 'workflow/cli/deploy.mdx'),
    `---
title: Deploy changes to production
---

import StrictCompilationFlags from '/snippets/strict-compilation-flags.mdx';

\`lightdash deploy\` pushes your local dbt or native Lightdash YAML models to Lightdash.

## Option 1: Deploy via the CLI

Basic usage:

By default, this will:

* Use your local dbt profile for the connection

* Push the current state of your local dbt project files to the authenticated Lightdash project

* Trigger a re-compile and refresh of your Lightdash project
`,
);
const workspace = `
export const Workspace = () => (
    <div>
        <a data-tour-anchor="workspace-file" data-tour-hint="Open the file" data-tour-hint-named="Open {value}" data-tour-value="models/payments.yml" />
        <div data-tour-anchor="workspace-editor" data-tour-hint="Edit the file" data-tour-input="true" data-tour-suggest="# Edited" />
        <input data-tour-anchor="terminal-command" data-tour-hint="Type the command" data-tour-input="true" data-tour-suggest="dbt parse" />
        <button data-tour-anchor="terminal-run" data-tour-hint="Run the command" />
        <div data-learn-terminal-output data-tour-anchor="terminal-running" data-tour-hint="Wait for the command to finish" />
    </div>
);
`;
const explore = `
export const Explore = () => (
    <div>
        <a data-tour-nav="new" data-tour-hint="Click New" />
        <a data-tour-nav="new-chart" data-tour-hint="Choose Chart" />
        <a data-tour-anchor="explore-table" data-tour-hint="Open a table" data-tour-hint-named="Open {value}" data-tour-value="Payments" />
        <input data-tour-anchor="explore-search" data-tour-hint="Search for the table" data-tour-input="true" data-tour-suggest="Orders by status" />
        <input data-tour-anchor="explore-field-search" data-tour-hint="Search for the field" data-tour-input="true" data-tour-suggest="Total revenue" />
        <div
            //   data-tour-anchor="explore-dimension" data-tour-hint="Select a dimension" data-tour-hint-named="Find {value}"
            //   data-tour-anchor="explore-metric" data-tour-hint="Select a metric" data-tour-hint-named="Find {value}"
            data-tour-anchor={x ? 'explore-metric' : undefined}
        />
    </div>
);
`;
const metricsLesson = {
    id: 'docs:semantic-layer/metrics' as const,
    docs: 'semantic-layer/metrics.mdx',
    intro: [
        'semantic-layer/metrics.mdx#intro:1-2',
        'semantic-layer/metrics.mdx#intro:p2:1',
    ],
    file: 'models/payments.yml',
    column: 'amount',
    fileDocs: 'semantic-layer/metrics.mdx#1-using-the-column-meta-tag:1',
    snippet:
        '            metrics:\n              average_payment_amount:\n                type: average',
    snippetDocs: 'semantic-layer/metrics.mdx#average:p2:1',
    command: 'lightdash deploy',
    commandDocs: 'workflow/cli/deploy.mdx#intro:1',
    outputDocs: [
        'workflow/cli/deploy.mdx#option-1-deploy-via-the-cli:li2',
        'workflow/cli/deploy.mdx#option-1-deploy-via-the-cli:li3',
    ],
    result: {
        explore: 'payments',
        field: 'average_payment_amount',
        kind: 'metric' as const,
    },
    resultDocs: 'explore/explore-view.mdx#the-explore-page:li1',
};

const run = async () => {
    const { checkTours } = await import('./check');
    const { buildTours, docsHeading, docsParagraph } = await import('./lib');

    // A curated set passes with no errors.
    {
        const files = [
            write('Nav.tsx', nav('Click Browse')),
            write('Pin.tsx', marker('explore/homepage.mdx#pin-content:2')),
        ];
        const errors = checkTours(files).filter((f) => f.level === 'error');
        assert.deepStrictEqual(errors, [], JSON.stringify(errors, null, 2));
        const { tours } = buildTours(files);
        assert.strictEqual(
            tours[0].steps.map((s) => s.title).join(' > '),
            'Pin content > Click Browse > Click Pin to homepage > Go home > See the result',
        );
        assert.strictEqual(
            tours[0].steps[2].body,
            'Select **Pin to homepage** from the menu.',
        );
    }

    // A second taught scope reuses the real controls, not nonexistent alias markers.
    {
        const files = [
            write('Nav.tsx', nav('Click Browse')),
            write(
                'Pin.tsx',
                marker(
                    'explore/homepage.mdx#pin-content:2',
                    '\n        data-tour-covers="view:PinnedItems"',
                ),
            ),
        ];
        const { tours } = buildTours(files);
        const primary = tours.find(
            (tour) => tour.scope === 'manage:PinnedItems',
        )!;
        const covered = tours.find((tour) => tour.scope === 'view:PinnedItems');
        assert.ok(covered, 'the taught viewer scope must have a runnable tour');
        assert.deepStrictEqual(covered.steps, primary.steps);
        assert.ok(covered.steps.some((step) => step.advanceOnTargetClick));
        assert.deepStrictEqual(
            checkTours(files).filter((f) => f.level === 'error'),
            [],
        );
    }

    // Invalid coverage must not create a tour for an unrecognized permission.
    {
        const files = [
            write('Nav.tsx', nav('Click Browse')),
            write(
                'Pin.tsx',
                marker(
                    'explore/homepage.mdx#pin-content:2',
                    '\n        data-tour-covers="manage:InventedPermission"',
                ),
            ),
        ];
        assert.throws(() => buildTours(files), /unknown scope/);
    }

    // Coverage must not replace a primary tour or attach to a passive marker.
    {
        const navFile = write('Nav.tsx', nav('Click Browse'));
        const source = marker(
            'explore/homepage.mdx#pin-content:2',
            '\n        data-tour-covers="view:PinnedItems"',
        );
        assert.throws(
            () =>
                buildTours([
                    navFile,
                    write(
                        'Pin.tsx',
                        source.replace('data-tour-interactive="true"', ''),
                    ),
                ]),
            /interactive action marker/,
        );
        assert.throws(
            () =>
                buildTours([
                    navFile,
                    write('Pin.tsx', source),
                    write(
                        'View.tsx',
                        marker('explore/homepage.mdx#pin-content:2').replaceAll(
                            'manage:PinnedItems',
                            'view:PinnedItems',
                        ),
                    ),
                ]),
            /duplicate walkthrough coverage/,
        );
        const repeated = buildTours([
            navFile,
            write('Pin.tsx', source + source),
        ]).tours;
        assert.strictEqual(
            repeated.filter((tour) => tour.scope === 'view:PinnedItems').length,
            1,
        );
    }

    // A malformed working-state selector reports a diagnostic, rather than crashing.
    {
        const files = [
            write('Nav.tsx', nav('Click Browse')),
            write(
                'Pin.tsx',
                marker(
                    'explore/homepage.mdx#pin-content:2',
                    '\n        data-tour-busy=".saving"',
                ),
            ),
        ];
        assert.ok(
            checkTours(files).some(
                (finding) =>
                    finding.level === 'error' &&
                    finding.message.includes('data-tour-busy must be'),
            ),
        );
    }

    // Removing the hint from the Browse anchor fails with the file and line.
    {
        const navFile = write('Nav.tsx', nav(null));
        const files = [
            navFile,
            write('Pin.tsx', marker('explore/homepage.mdx#pin-content:2')),
        ];
        const errors = checkTours(files).filter((f) => f.level === 'error');
        const hint = errors.find((f) => /no data-tour-hint/.test(f.message));
        assert.ok(
            hint,
            `expected a missing-hint error, got ${JSON.stringify(errors)}`,
        );
        assert.ok(hint.file.endsWith('Nav.tsx'), hint.file);
        assert.strictEqual(hint.line, 4, `line ${hint.line}`);
    }

    // A docs section with no matching sentence fails naming the anchor.
    {
        const files = [
            write('Nav.tsx', nav('Click Browse')),
            write('Pin.tsx', marker('explore/homepage.mdx#pin-content:9')),
        ];
        const errors = checkTours(files).filter((f) => f.level === 'error');
        assert.ok(
            errors.some((f) =>
                f.message.includes('explore/homepage.mdx#pin-content:9'),
            ),
            JSON.stringify(errors),
        );
    }

    // A docs anchor that does not exist fails naming it.
    {
        const files = [
            write('Nav.tsx', nav('Click Browse')),
            write('Pin.tsx', marker('explore/homepage.mdx#no-such-section:1')),
        ];
        const errors = checkTours(files).filter((f) => f.level === 'error');
        assert.ok(
            errors.some((f) => f.message.includes('no-such-section')),
            JSON.stringify(errors),
        );
    }

    // An unknown scope fails.
    {
        const files = [
            write('Nav.tsx', nav('Click Browse')),
            write(
                'Pin.tsx',
                marker('explore/homepage.mdx#pin-content:2').replace(
                    /manage:PinnedItems/g,
                    'manage:Nothing',
                ),
            ),
        ];
        const errors = checkTours(files).filter((f) => f.level === 'error');
        assert.ok(
            errors.some((f) => /unknown scope manage:Nothing/.test(f.message)),
            JSON.stringify(errors),
        );
    }

    // A route that is not a project route fails.
    {
        const files = [
            write('Nav.tsx', nav('Click Browse')),
            write(
                'Pin.tsx',
                marker('explore/homepage.mdx#pin-content:2').replace(
                    '/projects/:projectUuid/spaces',
                    '/projects/:projectUuid/nowhere',
                ),
            ),
        ];
        const errors = checkTours(files).filter((f) => f.level === 'error');
        assert.ok(
            errors.some((f) => /not a known project route/.test(f.message)),
            JSON.stringify(errors),
        );
    }

    // A typed anchor fails without a suggestion, passes with one.
    {
        const typedNav = (extra: string) =>
            nav('Type here').replace(
                'data-tour-nav="browse"',
                `data-tour-nav="browse"\n        data-tour-input="true"${extra}`,
            );
        const files = [
            write('Nav.tsx', typedNav('')),
            write('Pin.tsx', marker('explore/homepage.mdx#pin-content:2')),
        ];
        const errors = checkTours(files).filter((f) => f.level === 'error');
        assert.ok(
            errors.some((f) => /no data-tour-suggest/.test(f.message)),
            JSON.stringify(errors),
        );
        const suggested = [
            write(
                'Nav.tsx',
                typedNav('\n        data-tour-suggest="Orders overview"'),
            ),
            write('Pin.tsx', marker('explore/homepage.mdx#pin-content:2')),
        ];
        assert.deepStrictEqual(
            checkTours(suggested).filter((f) => f.level === 'error'),
            [],
        );
        assert.strictEqual(
            buildTours(suggested).tours[0].steps[1].suggestion,
            'Orders overview',
        );
    }

    // An optional hop (`?`) is a control the instance may or may not show on
    // the way to the next one (a chooser some configurations add). It gets no
    // step of its own: the next step carries it as a detour, taken only when
    // the control is on the page.
    {
        const files = [
            write('Nav.tsx', nav('Click Browse')),
            write(
                'Pin.tsx',
                marker(
                    'explore/homepage.mdx#pin-content:2',
                    `\n        data-tour-then='[data-tour-anchor="choose"]? >> [data-tour-anchor="confirm"]'`,
                ),
            ),
            write(
                'Dialog.tsx',
                `
export const Dialog = () => (
    <>
        {hasChooser && (
            <Button data-tour-anchor="choose" data-tour-hint="Click Download data" />
        )}
        <Button data-tour-anchor="confirm" data-tour-hint="Click Download" />
    </>
);
`,
            ),
        ];
        const errors = checkTours(files).filter((f) => f.level === 'error');
        assert.deepStrictEqual(errors, [], JSON.stringify(errors, null, 2));
        const { tours } = buildTours(files);
        assert.strictEqual(
            tours[0].steps.map((s) => s.title).join(' > '),
            'Pin content > Click Browse > Click Pin to homepage > Click Download > Go home > See the result',
        );
        assert.deepStrictEqual(tours[0].steps[3].detour, [
            {
                target: '[data-tour-anchor="choose"]',
                title: 'Click Download data',
            },
        ]);
        assert.deepStrictEqual(tours[0].steps[3].via, []);
        assert.strictEqual(tours[0].steps[2].detour, undefined);
    }

    // An optional hop with nothing after it has nowhere to detour to.
    {
        const files = [
            write('Nav.tsx', nav('Click Browse')),
            write(
                'Pin.tsx',
                marker(
                    'explore/homepage.mdx#pin-content:2',
                    `\n        data-tour-then='[data-tour-anchor="confirm"]?'`,
                ),
            ),
            write(
                'Dialog.tsx',
                `<Button data-tour-anchor="confirm" data-tour-hint="Click Download" />`,
            ),
        ];
        const errors = checkTours(files).filter((f) => f.level === 'error');
        assert.ok(
            errors.some((f) => /optional hop/.test(f.message)),
            JSON.stringify(errors),
        );
    }

    // A path mentioning an anchor is not that anchor: its hint must come
    // from the anchor's own element, even when the mention is found first.
    {
        const { hintFor } = await import('./lib');
        const mention = write(
            'AMenu.tsx',
            `
export const AMenu = () => (
    <Item
        data-tour-nav="all"
        data-tour-hint="Open All"
        data-tour-then='[data-tour-anchor="row"][data-tour-value="Sales"]'
    />
);
`,
        );
        const own = write(
            'Rows.tsx',
            `
const props = {
    'data-tour-anchor': 'row',
    'data-tour-hint': 'Open a row',
    'data-tour-hint-named': 'Open {value}',
};
`,
        );
        assert.strictEqual(
            hintFor('[data-tour-anchor="row"][data-tour-value="Sales"]', [
                mention,
                own,
            ]),
            'Open Sales',
        );
    }

    // A typed anchor declared as an object literal (a prop spread) counts,
    // suggestion included.
    {
        const { isInputAnchor, suggestionFor } = await import('./lib');
        const file = write(
            'Editor.tsx',
            `
export const Editor = () => (
    <Box
        {...(mode === 'new'
            ? {
                  'data-tour-anchor': 'editor',
                  'data-tour-hint': 'Write it',
                  'data-tour-input': 'true',
                  'data-tour-suggest': 'A suggestion',
              }
            : {})}
    />
);
`,
        );
        assert.strictEqual(
            isInputAnchor('[data-tour-anchor="editor"]', [file]),
            true,
        );
        assert.strictEqual(
            suggestionFor('[data-tour-anchor="editor"]', [file]),
            'A suggestion',
        );
    }

    // Object-literal markers: a via path holding `>>` must not end the block.
    {
        const { findMarkers } = await import('./lib');
        const file = write(
            'Card.tsx',
            `
export const Card = () => (
    <Box
        tourProps={{
            'data-tour-scope': 'manage:PinnedItems',
            'data-tour-step': '2',
            'data-tour-via': '[data-tour-nav="browse"] >> [data-tour-nav="home"]',
            'data-tour-docs': 'explore/homepage.mdx#pin-content:2',
        }}
    />
);
`,
        );
        assert.strictEqual(
            findMarkers(file)[0].docs,
            'explore/homepage.mdx#pin-content:2',
        );
    }

    // The intro step is titled by the docs: the cited section's heading,
    // or the page title for #intro.
    assert.strictEqual(
        docsHeading('explore/homepage.mdx#pin-content:2'),
        'Pin content',
    );
    assert.strictEqual(docsHeading('explore/homepage.mdx#intro:1'), 'Homepage');

    // Docs citation selectors: sentence, paragraph, list item, intro.
    assert.strictEqual(
        docsParagraph('explore/homepage.mdx#pin-content:2'),
        'Select **Pin to homepage** from the menu.',
    );
    assert.strictEqual(
        docsParagraph('explore/homepage.mdx#pin-content:li2'),
        '**Bullet two** - second item',
    );
    // A paragraph with no closing punctuation is one sentence.
    assert.strictEqual(
        docsParagraph('explore/homepage.mdx#name-it:1'),
        'Give it a memorable name',
    );
    // A markdown escape reads as its character.
    assert.strictEqual(
        docsParagraph('explore/homepage.mdx#escapes:1'),
        'Open **Settings > My apps** to see it.',
    );
    // A dot inside a word (a field reference) does not end a sentence.
    assert.strictEqual(
        docsParagraph('explore/homepage.mdx#pin-content:3'),
        'Pinned items show at the top, as **${table.field}** does.',
    );
    // Links survive, resolved to the docs site; a URL's dots do not end a
    // sentence.
    assert.strictEqual(
        docsParagraph('explore/homepage.mdx#pin-content:4'),
        'See [sharing](https://docs.lightdash.com/explore/homepage#sharing) or the [spaces page](https://docs.lightdash.com/explore/spaces.mdx) for who can see it.',
    );
    // Bold italics become bold; plain italics become plain text.
    assert.strictEqual(
        docsParagraph('explore/homepage.mdx#pin-content:5'),
        '**Editors and above** can pin, and only they can unpin.',
    );
    assert.throws(
        () => docsParagraph('explore/homepage.mdx#intro'),
        /paragraph 1 not found/,
    );

    // Suggestions: a hint from the control's text, docs from the label.
    {
        const { suggestFor } = await import('./suggest');
        const files = [
            write('Nav.tsx', nav(null)),
            write(
                'Pin.tsx',
                marker('explore/homepage.mdx#pin-content:2').replace(
                    '\n        data-tour-docs="explore/homepage.mdx#pin-content:2"',
                    '',
                ),
            ),
        ];
        const proposals = suggestFor('manage:PinnedItems', files);
        const hint = proposals.find((p) => p.kind === 'hint');
        assert.ok(
            hint && hint.suggestion === 'data-tour-hint="Click Browse"',
            JSON.stringify(proposals),
        );
        const docsProposal = proposals.find((p) => p.kind === 'docs');
        assert.ok(
            docsProposal &&
                (docsProposal.suggestion as string[]).includes(
                    'explore/homepage.mdx#pin-content:2',
                ),
            JSON.stringify(proposals),
        );
    }

    {
        // A page's concept comes from its title, and the title is usually the
        // first line of the frontmatter. Reading it with a pattern that wants
        // a newline in front returns nothing for every page, and the teaching
        // order silently degrades to a tie-break instead of failing.
        const { conceptOf } = await import('./order');
        assert.strictEqual(conceptOf('explore/homepage'), 'homepage');
        assert.strictEqual(conceptOf('explore/no-such-page'), undefined);
    }

    // A lesson becomes a fixed twelve-step tour over the workspace and the explore.
    {
        const { buildLessonTours, docsCardTitle } = await import('./lib');
        const files = [
            write('Workspace.tsx', workspace),
            write('Explore.tsx', explore),
        ];
        const [tour] = buildLessonTours([metricsLesson], files);
        assert.strictEqual(tour.scope, 'docs:semantic-layer/metrics');
        assert.strictEqual(tour.title, 'Metrics');
        assert.strictEqual(
            docsCardTitle('workflow/cli/deploy.mdx'),
            'Deploy changes to production',
        );
        // An empty `sidebarTitle:` is not a title: the page's title stands.
        writeFileSync(
            path.join(docs, 'workflow/cli/empty-sidebar.mdx'),
            '---\nsidebarTitle: ""\ntitle: Foo\n---\n\nBody.\n',
        );
        assert.strictEqual(
            docsCardTitle('workflow/cli/empty-sidebar.mdx'),
            'Foo',
        );
        assert.strictEqual(
            tour.steps.map((s) => s.title).join(' > '),
            'Metrics > Open models/payments.yml > Edit the file > Type the command > Run the command > See the result > Click New > Choose Chart > Search for the table > Open Payments > Find Average payment amount > The Explore page',
        );
        // The intro is a centered explainer: it names no control.
        assert.strictEqual(tour.steps[0].target, null);
        assert.strictEqual(
            tour.steps[0].body,
            'A metric is a value that describes or summarizes features from a collection of data points. For example: count of total number of user IDs, or sum of revenue. In Lightdash, metrics are used to summarize dimensions or, sometimes, other metrics.',
        );
        // Opening the file says where metrics live; the editor step says which.
        assert.strictEqual(
            tour.steps[1].body,
            "To add a metric to Lightdash using the **meta** tag, you define it in your dbt project under the dimension name you're trying to describe/summarize.",
        );
        assert.strictEqual(tour.steps[2].suggestion, metricsLesson.snippet);
        assert.strictEqual(tour.steps[2].suggestionContextLines, 1);
        assert.strictEqual(tour.steps[3].suggestionContextLines, undefined);
        assert.strictEqual(
            tour.steps[2].body,
            "The **average** metric can be used on any numeric dimension or, [for custom SQL](https://docs.lightdash.com/semantic-layer/metrics#using-custom-SQL-in-aggregate-metrics), any valid SQL expression that gives a numeric table column. Let's add **average_payment_amount**, an **average** metric on the **amount** column: it goes under that column's **metrics**. Add the highlighted lines under **metrics:**, or press Use it.",
        );
        assert.strictEqual(tour.steps[3].suggestion, 'lightdash deploy');
        assert.strictEqual(
            tour.steps[3].body,
            '**lightdash deploy** pushes your local dbt or native Lightdash YAML models to Lightdash.',
        );
        assert.strictEqual(
            tour.steps[5].target,
            '[data-learn-terminal-output]',
        );
        assert.strictEqual(
            tour.steps[5].busy,
            '[data-tour-anchor="terminal-running"]',
        );
        // A failed run returns to the editor step rather than moving on.
        assert.strictEqual(tour.steps[5].retryStep, 2);
        assert.strictEqual(
            tour.steps[tour.steps[5].retryStep!].target,
            '[data-tour-anchor="workspace-editor"]',
        );
        assert.strictEqual(
            tour.steps[5].body,
            'Push the current state of your local dbt project files to the authenticated Lightdash project. Trigger a re-compile and refresh of your Lightdash project.',
        );
        // The table list is virtualised: the table is searched for before it
        // can be clicked.
        assert.strictEqual(tour.steps[8].suggestion, 'Payments');
        // Titled from the anchor's own hint, like every other click or
        // typed step; only the closing look at the output carries a literal
        // title.
        assert.strictEqual(tour.steps[8].title, 'Search for the table');
        assert.strictEqual(
            tour.steps[8].target,
            '[data-tour-anchor="explore-search"]',
        );
        assert.strictEqual(
            tour.steps[9].target,
            '[data-tour-anchor="explore-table"][data-tour-value="Payments"]',
        );
        assert.deepStrictEqual(tour.steps[9].via, [
            '[data-tour-nav="new"]',
            '[data-tour-nav="new-chart"]',
            '[data-tour-anchor="explore-search"]',
        ]);
        // The table list's search is gone once the explore is open: the
        // field tree has its own.
        assert.strictEqual(
            tour.steps[10].target,
            '[data-tour-anchor="explore-field-search"]',
        );
        assert.strictEqual(tour.steps[10].suggestion, 'Average payment amount');
        assert.deepStrictEqual(tour.steps[10].via, [
            '[data-tour-nav="new"]',
            '[data-tour-nav="new-chart"]',
            '[data-tour-anchor="explore-search"]',
            '[data-tour-anchor="explore-table"][data-tour-value="Payments"]',
        ]);
        assert.strictEqual(
            tour.steps[11].target,
            '[data-tour-anchor="explore-metric"][data-tour-value="Average payment amount"]',
        );
        assert.strictEqual(tour.steps[11].interactive, false);
        assert.strictEqual(tour.steps[11].title, 'The Explore page');
        assert.strictEqual(
            tour.steps[11].body,
            '**Metrics and dimensions** available on the table you selected. **Average payment amount** is the metric you just deployed.',
        );
        // A dimension lesson ends on the dimension row and says so.
        const [dimensionTour] = buildLessonTours(
            [
                {
                    ...metricsLesson,
                    result: {
                        ...metricsLesson.result,
                        kind: 'dimension' as const,
                    },
                },
            ],
            files,
        );
        assert.strictEqual(
            dimensionTour.steps[11].target,
            '[data-tour-anchor="explore-dimension"][data-tour-value="Average payment amount"]',
        );
        assert.ok(
            dimensionTour.steps[11].body.endsWith(
                'is the dimension you just deployed.',
            ),
        );
        assert.ok(
            dimensionTour.steps[2].body.includes(
                'an **average** dimension on the **amount** column',
            ),
        );
        // A lesson that extends the model declares a column entry under
        // `columns:`; the key's owner is then the model, not a column.
        const columnLesson = {
            ...metricsLesson,
            column: undefined,
            snippet:
                '    columns:\n      - name: extra\n        description: x',
            result: {
                explore: 'payments',
                field: 'extra',
                kind: 'dimension' as const,
            },
        };
        const [columnTour] = buildLessonTours([columnLesson], files);
        assert.ok(
            columnTour.steps[2].body.endsWith(
                "Let's add **extra** to the **payments** model's **columns**. Add the highlighted lines under **columns:**, or press Use it.",
            ),
            columnTour.steps[2].body,
        );
        assert.throws(
            () =>
                buildLessonTours(
                    [
                        {
                            ...columnLesson,
                            snippet:
                                '    columns:\n      - name: other\n        description: x',
                        },
                    ],
                    files,
                ),
            /must declare the column entry "- name: extra"/,
        );
        assert.throws(
            () =>
                buildLessonTours(
                    [{ ...metricsLesson, column: undefined }],
                    files,
                ),
            /must declare the column entry "- name: average_payment_amount"/,
        );
        assert.throws(
            () =>
                buildLessonTours(
                    [
                        {
                            ...columnLesson,
                            snippet:
                                '            metrics:\n              - name: extra',
                        },
                    ],
                    files,
                ),
            /belongs to amount, not payments/,
        );
        // The snippet has to land under the declared column's `under:` key.
        assert.throws(
            () =>
                buildLessonTours(
                    [
                        {
                            ...metricsLesson,
                            snippet: metricsLesson.snippet.replace(
                                'metrics:',
                                'additional_dimensions:',
                            ),
                        },
                    ],
                    files,
                ),
            /has no additional_dimensions: key/,
        );
        assert.throws(
            () =>
                buildLessonTours(
                    [{ ...metricsLesson, snippet: '  foo: 1' }],
                    files,
                ),
            /must start with the key it extends/,
        );
        assert.throws(
            () =>
                buildLessonTours(
                    [{ ...metricsLesson, column: 'payment_id' }],
                    files,
                ),
            /belongs to amount, not payment_id/,
        );
        // A lesson names a real column of its file and a typed snippet.
        assert.throws(
            () =>
                buildLessonTours([{ ...metricsLesson, column: 'nope' }], files),
            /column nope is not a column of models\/payments.yml/,
        );
        assert.throws(
            () =>
                buildLessonTours(
                    [
                        {
                            ...metricsLesson,
                            snippet:
                                '            metrics:\n              foo:\n                label: x',
                        },
                    ],
                    files,
                ),
            /declares no type/,
        );
        assert.strictEqual(
            tour.steps[0].route,
            '/projects/:projectUuid/learn/workspace',
        );
        assert.strictEqual(
            tour.steps[8].route,
            '/projects/:projectUuid/tables/:tableName',
        );
        assert.deepStrictEqual(tour.sources, [
            'packages/frontend/src/features/learn/sandboxLessons.ts',
        ]);

        // The checker sees the lesson tour and finds nothing wrong with it.
        const errors = checkTours(files, [metricsLesson]).filter(
            (f) => f.level === 'error',
        );
        assert.deepStrictEqual(errors, [], JSON.stringify(errors, null, 2));

        // A lesson is validated before anything is built.
        assert.throws(
            () =>
                buildLessonTours(
                    [{ ...metricsLesson, id: 'docs:metrics' as const }],
                    files,
                ),
            /id must look like/,
        );
        assert.throws(
            () =>
                buildLessonTours(
                    [{ ...metricsLesson, file: 'models/nope.yml' }],
                    files,
                ),
            /learn bundle/,
        );
        assert.throws(
            () =>
                buildLessonTours(
                    [{ ...metricsLesson, command: 'rm -rf /' }],
                    files,
                ),
            /lightdash or dbt/,
        );
        assert.throws(
            () =>
                buildLessonTours(
                    [
                        {
                            ...metricsLesson,
                            snippetDocs: 'semantic-layer/metrics.mdx#nope:1',
                        },
                    ],
                    files,
                ),
            /Docs anchor not found/,
        );
        // Missing anchors in the frontend fail loudly, naming the selector.
        assert.throws(
            () =>
                buildLessonTours(
                    [metricsLesson],
                    [
                        files[0],
                        write(
                            'ExploreNoTable.tsx',
                            explore.replace(
                                /^.*data-tour-anchor="explore-table".*$/m,
                                '',
                            ),
                        ),
                    ],
                ),
            /explore-table/,
        );
        // A field the learner types into must be a typed anchor.
        assert.throws(
            () => buildLessonTours([metricsLesson], [files[0]]),
            /\[data-tour-anchor="explore-search"\] must be a typed anchor/,
        );
        // The field search is titled from the field row's own named hint, so
        // losing the row's declaration fails the build instead of leaving the
        // step pointing at a row nothing describes.
        assert.throws(
            () =>
                buildLessonTours(
                    [metricsLesson],
                    [
                        files[0],
                        write(
                            'ExploreNoMetric.tsx',
                            explore.replace(
                                /^.*data-tour-anchor="explore-metric".*$/m,
                                '',
                            ),
                        ),
                    ],
                ),
            /explore-metric/,
        );
        // Two lessons cannot share an id: the second would overwrite the
        // first in the generated map.
        assert.throws(
            () => buildLessonTours([metricsLesson, metricsLesson], files),
            /duplicate lesson id/,
        );
    }

    console.log('scope-tours: all checks passed');
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
