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

const run = async () => {
    const { checkTours } = await import('./scope-tours/check');
    const { buildTours, docsParagraph } = await import('./scope-tours/lib');

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
            'Pinned content appears on the homepage > Click Browse > Click Pin to homepage > Go home > See the result',
        );
        assert.strictEqual(
            tours[0].steps[2].body,
            'Select **Pin to homepage** from the menu.',
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

    // A path mentioning an anchor is not that anchor: its hint must come
    // from the anchor's own element, even when the mention is found first.
    {
        const { hintFor } = await import('./scope-tours/lib');
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
        const { isInputAnchor, suggestionFor } =
            await import('./scope-tours/lib');
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
        const { findMarkers } = await import('./scope-tours/lib');
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
        'See [sharing](https://docs.lightdash.com/explore/homepage#sharing) or the [**spaces page**](https://docs.lightdash.com/explore/spaces.mdx) for who can see it.',
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
        const { suggestFor } = await import('./scope-tours/suggest');
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

    console.log('scope-tours: all checks passed');
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
