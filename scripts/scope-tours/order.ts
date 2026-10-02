/**
 * A teaching order for the Learn library, read from the docs' navigation.
 *
 * The docs sidebar (docs.json) is the order the docs authors chose to
 * present each topic in. The library keeps its own sections, so Foundations
 * resolve before anything else, and within a section modules follow the
 * sidebar position of the docs page they cite, then that page's own heading
 * order.
 *
 * Writes the order the library sorts by. PR CI regenerates it for validation;
 * the release workflow commits the current result with the generated tours.
 *
 * Usage: pnpm scope-tours:order   (LIGHTDASH_DOCS_DIR overrides ../mintlify-docs)
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
    buildLearnCatalogue,
    FOUNDATIONS,
    GROUP_LABELS,
    GROUP_ORDER,
    type LearnModule,
} from '../../packages/frontend/src/features/learn/catalogue';
import { docsDir, findMarkers, frontendSrc, listTsx, slugify } from './lib';

/**
 * A docs page's headings, in page order, as anchors. Code blocks are
 * skipped, and link targets and tags removed so a heading slugs as it reads.
 */
const headingsOf = (page: string): string[] => {
    let source: string;
    try {
        source = readFileSync(path.join(docsDir, `${page}.mdx`), 'utf8');
    } catch {
        return [];
    }
    return source
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\]\([^)]*\)/g, ']')
        .replace(/<[^>]*>/g, ' ')
        .split('\n')
        .filter((line) => /^#{2,3} /.test(line))
        .map((line) => slugify(line.replace(/^#+ /, '').trim()));
};

/** Where a walkthrough opens in the docs: the page and heading it first cites. */
export type Citation = { page: string; anchor: string };

export const citationForScope = (): Map<string, Citation> => {
    const byScope = new Map<string, { step: number } & Citation>();
    listTsx(frontendSrc).forEach((file) => {
        findMarkers(file).forEach((marker) => {
            if (!marker.docs || marker.step === undefined) return;
            const [page, rest = ''] = marker.docs
                .replace(/\.mdx(?=#|$)/, '')
                .split('#');
            const held = byScope.get(marker.scope);
            if (!held || marker.step < held.step) {
                byScope.set(marker.scope, {
                    step: marker.step,
                    page,
                    anchor: rest.split(':')[0],
                });
            }
        });
    });
    return new Map(
        [...byScope].map(
            ([scope, { page, anchor }]) => [scope, { page, anchor }] as const,
        ),
    );
};

/**
 * How far down its page a cited heading sits. Within one topic the docs'
 * own heading order is the author's teaching order, so a module citing an
 * earlier heading is the earlier lesson.
 */
export const headingRank = (page: string, anchor: string): number => {
    if (!anchor || anchor === 'intro') return 0;
    const headings = headingsOf(page);
    const at = headings.indexOf(anchor);
    return at < 0 ? headings.length : at + 1;
};

/**
 * Every page in the docs sidebar, top to bottom. A group's landing page
 * (`root`) comes before the pages under it.
 */
export const navOrder = (): string[] => {
    const config = JSON.parse(
        readFileSync(path.join(docsDir, 'docs.json'), 'utf8'),
    ) as { navigation?: unknown };
    const pages: string[] = [];
    const walk = (node: unknown): void => {
        if (typeof node === 'string') {
            pages.push(node);
        } else if (Array.isArray(node)) {
            node.forEach(walk);
        } else if (node && typeof node === 'object') {
            const entry = node as Record<string, unknown>;
            if (typeof entry.root === 'string') pages.push(entry.root);
            [
                'navigation',
                'languages',
                'versions',
                'tabs',
                'dropdowns',
                'anchors',
                'groups',
                'pages',
            ].forEach((key) => walk(entry[key]));
        }
    };
    walk(config.navigation);
    return pages;
};

/**
 * A section's order: modules by where the page they cite sits in the
 * sidebar, then by where their heading sits on that page. A module citing
 * no page, or a page the sidebar leaves out, sorts last.
 */
const orderWithin = (
    modules: LearnModule[],
    cite: Map<string, Citation>,
    nav: string[],
): LearnModule[] => {
    const position = (module: LearnModule) => {
        const at = nav.indexOf(cite.get(module.scope)?.page ?? '');
        return at < 0 ? nav.length : at;
    };
    const rank = (module: LearnModule) => {
        const c = cite.get(module.scope);
        return c ? headingRank(c.page, c.anchor) : 0;
    };
    return [...modules].sort(
        (a, b) =>
            position(a) - position(b) ||
            rank(a) - rank(b) ||
            a.stepCount - b.stepCount ||
            a.title.localeCompare(b.title),
    );
};

export const curriculum = (): LearnModule[] => {
    const cite = citationForScope();
    const modules = buildLearnCatalogue().filter(
        (module) => module.kind === 'scope' && module.available,
    );
    const nav = navOrder();
    // Fail loudly: a cited page missing from the sidebar sorts last, and the
    // result still looks plausible without it.
    const unlisted = [
        ...new Set(
            modules
                .map((module) => cite.get(module.scope)?.page)
                .filter(
                    (page): page is string =>
                        page !== undefined && !nav.includes(page),
                ),
        ),
    ];
    if (unlisted.length > 0) {
        throw new Error(
            `Not in the docs sidebar (docs.json): ${unlisted.join(', ')}`,
        );
    }
    return GROUP_ORDER.flatMap((group) =>
        orderWithin(
            modules.filter((module) => module.group === group),
            cite,
            nav,
        ),
    );
};

/** Where the library reads the order from. */
export const curriculumPath = path.join(
    frontendSrc,
    'features/scopeTours/curriculum.ts',
);

const fileFor = (modules: LearnModule[]): string => {
    const lines = modules.map((module) => `    '${module.scope}',`).join('\n');
    return `// Generated by scripts/scope-tours/order.ts. Do not edit by hand.
// The order the library teaches its modules in, read from the docs: sections
// as the library has them, modules within a section by the docs sidebar
// position of the page they cite, then by that page's heading order. A scope
// missing here sorts last.
export const CURRICULUM: string[] = [
${lines}
];
`;
};

if (require.main === module) {
    const modules = curriculum();
    writeFileSync(curriculumPath, fileFor(modules), 'utf8');
    process.stdout.write(
        `Wrote a teaching order for ${modules.length} module(s) to ${path.relative(
            path.join(frontendSrc, '../../..'),
            curriculumPath,
        )}\n`,
    );
    const cite = citationForScope();
    let group: string | undefined;
    modules.forEach((module, index) => {
        if (module.group !== group) {
            group = module.group;
            const label =
                group === FOUNDATIONS
                    ? 'Foundations'
                    : GROUP_LABELS[group as keyof typeof GROUP_LABELS];
            process.stdout.write(`\n${label}\n`);
        }
        const c = cite.get(module.scope);
        const cited = c
            ? `${c.page}${c.anchor ? `#${c.anchor}` : ''}`
            : '(no docs page)';
        process.stdout.write(
            `${String(index + 1).padStart(3)}. ${module.title.padEnd(38)} ${cited}\n`,
        );
    });
}
