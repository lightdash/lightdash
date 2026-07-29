/**
 * Docs-as-fixtures: every JS/TS code sample in the template's skill.md and
 * references/*.md must fully resolve (or be allowlisted with a reason), so
 * the docs and the extractor cannot drift apart.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
    extractDataAppDataReferences,
    type ExtractedDataReference,
    type ExtractedQueryReference,
} from './dataReferences';

// Vitest runs with cwd at packages/common (test files compile in the CJS
// build, so import.meta is not available here).
const TEMPLATE_DIR = resolve(
    process.cwd(),
    '../../sandboxes/data-apps/template',
);

const JS_LANGS = new Set([
    'js',
    'jsx',
    'ts',
    'tsx',
    'javascript',
    'typescript',
]);
const FENCE_RE = /```(\w+)?\n([\s\S]*?)```/g;

// Samples that legitimately fail to parse standalone (JSX fragments,
// placeholder snippets). Keyed by `<doc>#<fenced-block-index>`, where the
// index counts ALL fenced blocks in the doc, any language.
const KNOWN_UNPARSEABLE: Record<string, string> = {
    'skill.md#12': 'adjacent JSX fragment (axis defaults snippet)',
    'skill.md#19': 'adjacent JSX fragment (screenshot crop snippet)',
    'skill.md#20':
        'bare comment as JSX ternary alternate (loading-states skeleton)',
    'skill.md#25': '`{...}` placeholder in DropdownMenu snippet',
    'skill.md#29': 'adjacent JSX fragment (dialog snippet)',
};

// Samples whose references legitimately cannot fully resolve.
const KNOWN_UNRESOLVED: Record<string, string> = {
    'references/d3.md#3':
        'sunburst addFilter field comes from the clicked hierarchy node (runtime value)',
    'references/drilldown.md#1':
        'drillDown() signature illustration — arguments are placeholder identifiers',
    'references/drilldown.md#2':
        'fragment: sourceQuery shorthand refers to a variable outside the block',
};

type DocBlock = {
    key: string; // `<doc>#<index>`
    doc: string;
    firstLine: string;
    code: string;
};

function loadDocBlocks(): DocBlock[] {
    // Missing dir → [] so the sanity-floor test fails readably.
    if (!existsSync(TEMPLATE_DIR)) return [];
    const docs = [
        'skill.md',
        ...readdirSync(join(TEMPLATE_DIR, 'references'))
            .filter((f) => f.endsWith('.md'))
            .sort()
            .map((f) => `references/${f}`),
    ];
    const blocks: DocBlock[] = [];
    for (const doc of docs) {
        const content = readFileSync(join(TEMPLATE_DIR, doc), 'utf-8');
        let index = -1;
        for (const match of content.matchAll(FENCE_RE)) {
            index += 1;
            if (JS_LANGS.has((match[1] ?? '').toLowerCase())) {
                const code = match[2];
                blocks.push({
                    key: `${doc}#${index}`,
                    doc,
                    firstLine:
                        code.split('\n').find((l) => l.trim().length > 0) ?? '',
                    code,
                });
            }
        }
    }
    return blocks;
}

type BlockResult = DocBlock & {
    parseError: string | null;
    references: ExtractedDataReference[];
};

const results: BlockResult[] = loadDocBlocks().map((block) => {
    const extracted = extractDataAppDataReferences([
        // .tsx parses every doc block: samples are TS-flavored JSX or plain JS.
        { path: 'src/DocSample.tsx', content: block.code },
    ]);
    return {
        ...block,
        parseError: extracted.parseErrors[0]?.message ?? null,
        references: extracted.references,
    };
});

const describeBlock = (r: BlockResult) =>
    `${r.key} ("${r.firstLine.slice(0, 60)}")`;

describe('data-app docs as extractor fixtures', () => {
    it('found the template docs and a meaningful number of samples', () => {
        // The suite must not silently pass on zero scanned blocks.
        expect(existsSync(TEMPLATE_DIR)).toBe(true);
        expect(results.length).toBeGreaterThanOrEqual(35);
        expect(
            results.flatMap((r) => r.references).length,
        ).toBeGreaterThanOrEqual(20);
    });

    it('parses every sample except the known JSX fragments', () => {
        const failed = results.filter((r) => r.parseError !== null);
        const unexpected = failed.filter((r) => !(r.key in KNOWN_UNPARSEABLE));
        expect(
            unexpected.map((r) => `${describeBlock(r)}: ${r.parseError}`),
        ).toEqual([]);
        // Stale allowlist entries must be removed once samples parse again.
        const failedKeys = new Set(failed.map((r) => r.key));
        expect(
            Object.keys(KNOWN_UNPARSEABLE).filter((k) => !failedKeys.has(k)),
        ).toEqual([]);
    });

    it('fully resolves every reference the docs teach, except known dynamics', () => {
        const withUnresolved = results.filter((r) =>
            r.references.some((ref) => ref.unresolved.length > 0),
        );
        const unexpected = withUnresolved.filter(
            (r) => !(r.key in KNOWN_UNRESOLVED),
        );
        expect(
            unexpected.map(
                (r) =>
                    `${describeBlock(r)}: ${r.references
                        .filter((ref) => ref.unresolved.length > 0)
                        .map(
                            (ref) =>
                                `${ref.kind}@L${ref.location.line} unresolved=${ref.unresolved.join(',')}`,
                        )
                        .join('; ')}`,
            ),
        ).toEqual([]);
        const unresolvedKeys = new Set(withUnresolved.map((r) => r.key));
        expect(
            Object.keys(KNOWN_UNRESOLVED).filter((k) => !unresolvedKeys.has(k)),
        ).toEqual([]);
    });

    it('resolves the d3 const-identifier pattern (.dimensions([NODE_FIELD, TARGET_FIELD]))', () => {
        const sankey = results
            .filter((r) => r.doc === 'references/d3.md')
            .flatMap((r) => r.references)
            .filter(
                (ref): ref is ExtractedQueryReference => ref.kind === 'query',
            )
            .find((ref) => ref.dimensions.includes('source_segment'));
        expect(sankey).toMatchObject({
            explore: 'orders',
            dimensions: ['source_segment', 'target_segment'],
            unresolved: [],
        });
    });

    it('resolves the d3 spread-const-array pattern (.dimensions([...LEVELS]))', () => {
        const sunburst = results
            .filter((r) => r.doc === 'references/d3.md')
            .flatMap((r) => r.references)
            .filter(
                (ref): ref is ExtractedQueryReference => ref.kind === 'query',
            )
            .find((ref) => ref.dimensions.includes('region'));
        expect(sunburst).toMatchObject({
            explore: 'orders',
            dimensions: ['customer_segment', 'region'],
            unresolved: [],
        });
    });

    it('folds the skill.md chain-fork pattern into one fully resolved query', () => {
        const fork = results
            .filter((r) => r.doc === 'skill.md')
            .flatMap((r) => r.references)
            .filter(
                (ref): ref is ExtractedQueryReference => ref.kind === 'query',
            )
            .find(
                (ref) =>
                    ref.dimensions.includes('customer_segment') &&
                    ref.dimensions.includes('region'),
            );
        expect(fork).toMatchObject({ explore: 'orders', unresolved: [] });
    });
});
