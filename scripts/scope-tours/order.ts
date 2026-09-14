/**
 * A teaching order for the Learn library, inferred from the docs.
 *
 * The library sorts alphabetically inside each section, which tells a learner
 * nothing about what to do first. The docs do not state prerequisites and
 * their links mean "see also", so neither can be read as a curriculum. What
 * the prose does carry is which concept leans on which: each docs page owns
 * a concept named by its own title, and a page that repeatedly reaches for
 * another page's concept without being reached for in return is the later
 * lesson. That asymmetry is the order.
 *
 * Sections stay as the library already has them, so Foundations resolve
 * before anything else and the inference only orders within a section.
 *
 * Writes the order the library sorts by. Run it when the markers or the docs
 * change; CI regenerates and fails on a diff, as it does for the tours.
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

/** Words that name the act of using a feature, never the feature itself. */
const TITLE_VERBS = new Set([
    'a',
    'an',
    'and',
    'build',
    'building',
    'create',
    'creating',
    'curate',
    'for',
    'how',
    'in',
    'interacting',
    'of',
    'on',
    'set',
    'share',
    'sharing',
    'the',
    'to',
    'up',
    'use',
    'using',
    'with',
    'work',
    'working',
    'your',
]);

const body = (page: string): string => {
    try {
        return readFileSync(path.join(docsDir, `${page}.mdx`), 'utf8')
            .replace(/```[\s\S]*?```/g, '')
            // Link targets and image paths repeat the words of the prose
            // around them, so a single cross-reference would otherwise read
            // as the page returning to that concept.
            .replace(/\]\([^)]*\)/g, ']')
            .replace(/<[^>]*>/g, ' ')
            .toLowerCase();
    } catch {
        return '';
    }
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
    const headings = body(page)
        .split('\n')
        .filter((line) => /^#{2,3} /.test(line))
        .map((line) => slugify(line.replace(/^#+ /, '').trim()));
    const at = headings.indexOf(anchor);
    return at < 0 ? headings.length : at + 1;
};

/**
 * The concept a docs page owns, from its own title: the nouns left once the
 * verbs of doing are removed. "Interacting with dashboards" owns dashboards.
 */
export const conceptOf = (page: string): string | undefined => {
    let source: string;
    try {
        source = readFileSync(path.join(docsDir, `${page}.mdx`), 'utf8');
    } catch {
        return undefined;
    }
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
    const title = frontmatter
        ?.match(/^title:\s*"?([^"\n]+?)"?\s*$/m)?.[1]
        ?.trim();
    if (!title) return undefined;
    const words = title
        .toLowerCase()
        .replace(/[^a-z ]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 0 && !TITLE_VERBS.has(word));
    if (words.length === 0) return undefined;
    return words.slice(-2).join(' ');
};

/**
 * How many of a page's sentences reach for a concept. Counting sentences
 * rather than words is what separates a page explaining itself in another
 * page's terms from one that names it once on the way past.
 */
const mentions = (text: string, concept: string): number => {
    const pattern = new RegExp(`\\b${concept.replace(/ /g, '\\s+')}s?\\b`);
    return text
        .split(/(?<=[.!?])\s+|\n/)
        .filter((sentence) => pattern.test(sentence)).length;
};

/**
 * Pages b that page a leans on: a reaches for b's concept at least twice and
 * more than twice as often as b reaches back. The margin keeps a passing
 * mention from reading as a dependency.
 */
export const leansOn = (pages: string[]): Map<string, Set<string>> => {
    const concept = new Map(
        pages.map((page) => [page, conceptOf(page)] as const),
    );
    const text = new Map(pages.map((page) => [page, body(page)] as const));
    return new Map(
        pages.map((a) => {
            const deps = new Set<string>();
            pages.forEach((b) => {
                const [ca, cb] = [concept.get(a), concept.get(b)];
                if (a === b || !ca || !cb) return;
                // Two pages can own one concept, an overview and its detail
                // page. The docs say which is which by nesting one under the
                // other, and the overview is the lesson that comes first.
                if (ca === cb) {
                    if (a.startsWith(`${b}/`)) deps.add(b);
                    return;
                }
                const forward = mentions(text.get(a) ?? '', cb);
                const back = mentions(text.get(b) ?? '', ca);
                if (forward >= 2 && forward > back * 2) deps.add(b);
            });
            return [a, deps] as const;
        }),
    );
};

/**
 * A section's order: its topics (the docs pages its modules cite) settled by
 * which concept leans on which, and inside a topic the docs' own heading
 * order, which is the order that page teaches its parts in.
 */
const orderWithin = (
    modules: LearnModule[],
    cite: Map<string, Citation>,
    deps: Map<string, Set<string>>,
): LearnModule[] => {
    const pageOf = (module: LearnModule) => cite.get(module.scope)?.page ?? '';
    const topics = [...new Set(modules.map(pageOf))];
    const placed = new Set<string>();
    const ordered: string[] = [];
    while (ordered.length < topics.length) {
        const left = topics.filter((topic) => !placed.has(topic));
        const unmet = (topic: string) =>
            [...(deps.get(topic) ?? [])].filter((dep) => left.includes(dep))
                .length;
        const fewest = Math.min(...left.map(unmet));
        const next = left
            .filter((topic) => unmet(topic) === fewest)
            .sort((a, b) => {
                const size = (topic: string) =>
                    Math.min(
                        ...modules
                            .filter((module) => pageOf(module) === topic)
                            .map((module) => module.stepCount),
                    );
                return size(a) - size(b) || a.localeCompare(b);
            })[0];
        ordered.push(next);
        placed.add(next);
    }
    return ordered.flatMap((topic) =>
        modules
            .filter((module) => pageOf(module) === topic)
            .sort((a, b) => {
                const rank = (module: LearnModule) => {
                    const c = cite.get(module.scope);
                    return c ? headingRank(c.page, c.anchor) : 0;
                };
                return (
                    rank(a) - rank(b) ||
                    a.stepCount - b.stepCount ||
                    a.title.localeCompare(b.title)
                );
            }),
    );
};

export const curriculum = (): LearnModule[] => {
    const cite = citationForScope();
    const modules = buildLearnCatalogue().filter((module) => module.available);
    const pages = [
        ...new Set(
            modules
                .map((module) => cite.get(module.scope)?.page)
                .filter((p): p is string => p !== undefined),
        ),
    ];
    // Fail loudly: a page whose concept will not resolve contributes nothing
    // to the order, and the result still looks plausible without it.
    const nameless = pages.filter((page) => conceptOf(page) === undefined);
    if (nameless.length > 0) {
        throw new Error(
            `No concept could be read from the title of: ${nameless.join(', ')}`,
        );
    }
    const deps = leansOn(pages);
    return GROUP_ORDER.flatMap((group) =>
        orderWithin(
            modules.filter((module) => module.group === group),
            cite,
            deps,
        ),
    );
};

/** Where the library reads the order from. */
export const curriculumPath = path.join(
    frontendSrc,
    'features/scopeTours/curriculum.ts',
);

const fileFor = (modules: LearnModule[]): string => {
    const lines = modules
        .map((module) => `    '${module.scope}',`)
        .join('\n');
    return `// Generated by scripts/scope-tours/order.ts. Do not edit by hand.
// The order the library teaches its modules in, inferred from the docs:
// sections as the library has them, topics within a section ordered by which
// concept the docs lean on, and modules within a topic by the docs' own
// heading order. A scope missing here sorts last.
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
