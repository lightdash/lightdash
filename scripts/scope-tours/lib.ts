/**
 * Shared by the generator, the checker and the suggester: how markers are
 * read from the frontend, how docs sentences are cited, and how a set of
 * markers becomes a walkthrough. See generate.ts for the marker contract.
 */
import { getScopes } from '@lightdash/common';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const root = path.resolve(__dirname, '../..');
export const frontendSrc = path.join(root, 'packages/frontend/src');
export const docsDir = path.resolve(
    process.env.LIGHTDASH_DOCS_DIR ?? path.join(root, '../mintlify-docs'),
);
export const outputPath = path.join(
    frontendSrc,
    'features/scopeTours/generated.ts',
);

export type Marker = {
    scope: string;
    covers?: string[];
    /** Order within the walkthrough; absent on a `data-tour-result` marker. */
    step?: number;
    /** Order among the further result surfaces. */
    result?: number;
    /** Order among looks taken on the way, each after the path click it names. */
    look?: number;
    /** For a look: the path selector after whose click the look is taken. */
    after?: string;
    route?: string;
    label?: string;
    /** On the action marker: the walkthrough's own name (a library card). */
    title?: string;
    docs?: string;
    interactive: boolean;
    via?: string;
    then?: string;
    return?: string;
    resultDocs?: string;
    busy?: string;
    file: string;
    /** 1-based line of the marker's block in `file`. */
    line: number;
};

export const listTsx = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
            return entry === 'node_modules' ? [] : listTsx(full);
        }
        return full.endsWith('.tsx') ? [full] : [];
    });

/**
 * Markers appear either as JSX attributes (`data-tour-step="2"`) or as keys
 * of an object literal spread onto an element (`'data-tour-step': '2'`). Both
 * are read from the text between the enclosing `<`/`{` and `>`/`}`.
 */
export const ATTR_JSX = /data-tour-([a-z]+)=(?:"([^"]*)"|'([^']*)')/g;
export const ATTR_OBJECT = /'data-tour-([a-z]+)'\s*:\s*'([^']*)'/g;

/**
 * Index of the `>` (JSX tag) or `}` (object literal) that closes the marker's
 * block, ignoring any inside quoted attribute values (a selector path can
 * contain `>>` or `}`).
 */
export const findBlockEnd = (source: string, from: number): number => {
    let quote: string | null = null;
    // `from` may sit inside a quoted object key (`'data-tour-scope': ...`);
    // step back onto its opening quote so the quote phase is right, else a
    // `>` inside a later path value would end the block early.
    const begin = source[from - 1] === "'" ? from - 1 : from;
    for (let index = begin; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (char === quote) quote = null;
        } else if (char === '"' || char === "'" || char === '`') {
            quote = char;
        } else if (char === '>' || char === '}') {
            return index;
        }
    }
    return source.length;
};

/**
 * `data-tour-hint` of the element matched by an anchor selector such as
 * `[data-tour-nav="browse"]` or `[data-tour-anchor="resource-actions"]`, read
 * from the frontend source. Other selectors get a generic instruction.
 */
export const PATH_SELECTOR =
    /^\[(data-tour-(?:nav|anchor))="([^"]+)"\](?:\[data-tour-value="([^"]+)"\])?$/;

export type PathHop = {
    selector: string;
    /**
     * A `?` hop: a control the instance may or may not show on the way to
     * the next one (a chooser some configurations add before a form). It
     * gets no step of its own; the next control's step carries it as a
     * detour, spotlit only while the next control is not on the page.
     */
    optional: boolean;
};

/** Split a click path (`<sel> >> <sel>? >> ...`) into its hops. */
export const parsePath = (value?: string): PathHop[] =>
    value
        ? value
              .split(' >> ')
              .map((v) => v.trim())
              .map((hop) =>
                  hop.endsWith('?')
                      ? { selector: hop.slice(0, -1), optional: true }
                      : { selector: hop, optional: false },
              )
        : [];

/** Whether an anchor selector points at a typed-input control (`data-tour-input`). */
/**
 * The JSX block that declares an anchor (preceded by whitespace; the same
 * text inside a path attribute is a use, not a declaration), or null.
 */
export const anchorBlock = (
    selector: string,
    sources: string[],
): string | null => {
    const match = selector.match(PATH_SELECTOR);
    if (!match) return null;
    const [, attribute, value] = match;
    for (const file of sources) {
        const source = readFileSync(file, 'utf8');
        const found = source.match(
            new RegExp(
                `(?<=\\s)(?:${attribute}="${value}"|'${attribute}': '${value}')`,
            ),
        );
        if (found?.index === undefined) continue;
        const start = Math.max(
            source.lastIndexOf('<', found.index),
            source.lastIndexOf('{', found.index),
        );
        return source.slice(start, findBlockEnd(source, found.index));
    }
    return null;
};

/** Whether an anchor selector points at a typed-input control (`data-tour-input`). */
export const isInputAnchor = (selector: string, sources: string[]): boolean =>
    /data-tour-input="true"|'data-tour-input':\s*'true'/.test(
        anchorBlock(selector, sources) ?? '',
    );

/**
 * What the card offers a learner to type into an input anchor
 * (`data-tour-suggest`): a value that fits the seeded content, so the step
 * has a one-click way through as well as a free one.
 */
export const suggestionFor = (
    selector: string,
    sources: string[],
): string | undefined =>
    anchorBlock(selector, sources)
        ?.match(/data-tour-suggest="([^"]*)"|'data-tour-suggest':\s*'([^']*)'/)
        ?.slice(1)
        .find((x) => x !== undefined);

export const hintFor = (selector: string, sources: string[]): string => {
    const match = selector.match(PATH_SELECTOR);
    if (!match) {
        throw new Error(
            `${selector}: click paths may only use data-tour-nav / data-tour-anchor selectors, optionally with [data-tour-value]`,
        );
    }
    const [, attribute, value, named] = match;
    const fill = (hint: string) =>
        named ? hint.replace(/\{value\}/g, named) : hint;
    // An anchor used both plainly and by name may carry a second hint for
    // the named case (`data-tour-hint-named="Open {value}"`).
    const pick = (block: string) => {
        const namedHint =
            block.match(/data-tour-hint-named="([^"]*)"/) ??
            block.match(/'data-tour-hint-named':\s*'([^']*)'/);
        if (named && namedHint) return namedHint[1];
        const hint =
            block.match(/data-tour-hint="([^"]*)"/) ??
            block.match(/'data-tour-hint':\s*'([^']*)'/);
        return hint?.[1];
    };
    for (const file of sources) {
        const source = readFileSync(file, 'utf8');
        // The anchor's own declaration, not a mention of it inside another
        // element's path (`data-tour-then='[data-tour-anchor="x"]...'`),
        // which would hand back that element's hint.
        const at = source.match(
            new RegExp(
                `(?<=\\s)(?:${attribute}="${value}"|'${attribute}': '${value}')`,
            ),
        )?.index;
        if (at === undefined) continue;
        // A hint on the same line wins (an anchor computed in code declares
        // its hints as literal lines); otherwise the enclosing element's.
        const lineStart = source.lastIndexOf('\n', at) + 1;
        const lineEnd = source.indexOf('\n', at);
        const line = source.slice(
            lineStart,
            lineEnd === -1 ? undefined : lineEnd,
        );
        const onLine = pick(line);
        if (onLine) return fill(onLine);
        const start = Math.max(
            source.lastIndexOf('<', at),
            source.lastIndexOf('{', at),
        );
        const block = source.slice(start, findBlockEnd(source, at));
        const hint = pick(block);
        if (hint) return fill(hint);
    }
    throw new Error(`No data-tour-hint found for ${selector}`);
};

export const findMarkers = (file: string): Marker[] => {
    const source = readFileSync(file, 'utf8');
    const markers: Marker[] = [];
    let at = source.indexOf('data-tour-scope');
    while (at !== -1) {
        const start = Math.max(
            source.lastIndexOf('<', at),
            source.lastIndexOf('{', at),
        );
        const end = findBlockEnd(source, at);
        const block = source.slice(start, end);
        const attrs: Record<string, string> = {};
        for (const match of [
            ...block.matchAll(ATTR_JSX),
            ...block.matchAll(ATTR_OBJECT),
        ]) {
            attrs[match[1]] = match[2] ?? match[3];
        }
        if (attrs.scope && (attrs.step || attrs.result || attrs.look)) {
            markers.push({
                scope: attrs.scope,
                covers: attrs.covers?.split(/[,\s]+/).filter(Boolean),
                step: attrs.step ? Number(attrs.step) : undefined,
                result: attrs.result ? Number(attrs.result) : undefined,
                look: attrs.look ? Number(attrs.look) : undefined,
                after: attrs.after,
                route: attrs.route,
                label: attrs.label,
                title: attrs.title,
                docs: attrs.docs,
                interactive: attrs.interactive === 'true',
                via: attrs.via,
                then: attrs.then,
                return: attrs.return,
                resultDocs: attrs.resultdocs,
                busy: attrs.busy,
                file: path.relative(root, file),
                line: source.slice(0, start).split('\n').length,
            });
        }
        at = source.indexOf('data-tour-scope', end);
    }
    return markers;
};

export const slugify = (heading: string) =>
    heading
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

/**
 * Text under the heading named by `file#anchor[:sentences]`, from the docs:
 * the first paragraph, optionally narrowed to sentence `n` or `a-b` (1-based)
 * so one section can feed several steps. Bold is kept as `**...**` for the
 * host to render; the docs bold the product's permission and control names.
 */
/** Connectors that only make sense with the sentence before them. */
export const LEADING_CONNECTORS = [
    'Either way, ',
    'In other words, ',
    'As mentioned earlier, ',
    'As a result, ',
    'That said, ',
];

/** Where the docs are published; links in cited text point there. */
export const DOCS_SITE = 'https://docs.lightdash.com';

/**
 * A link target as written in a docs page, resolved to the published site:
 * `#anchor` stays on that page, `/path#anchor` is site-relative, and full
 * URLs are left alone.
 */
export const docsUrl = (page: string, href: string): string => {
    const resolved = (() => {
        if (/^[a-z]+:/i.test(href)) return href;
        if (href.startsWith('#')) {
            return `${DOCS_SITE}/${page.replace(/\.mdx$/, '')}${href}`;
        }
        return `${DOCS_SITE}${href.startsWith('/') ? '' : '/'}${href}`;
    })();
    // Cards link to the docs site only: a docs edit must not be able to
    // send learners anywhere else from inside the product.
    if (!resolved.startsWith(`${DOCS_SITE}/`)) {
        throw new Error(
            `Docs link off the docs site is not allowed in a walkthrough: ${href} (in ${page})`,
        );
    }
    return resolved;
};

/**
 * The title the docs give the text a step cites: the section heading named
 * by `file#anchor`, or the page's own title for `#intro`. Intro steps are
 * titled this way so a walkthrough opens with the docs' words, not ours.
 * A leading step number in a heading ("3. Run your own query") is dropped.
 */
export const docsHeading = (ref: string): string => {
    const [relative, anchorWithRange] = ref.split('#');
    const [anchor] = anchorWithRange.split(':');
    const lines = readFileSync(path.join(docsDir, relative), 'utf8').split(
        '\n',
    );
    if (anchor === 'intro') {
        const title = lines
            .slice(0, lines[0] === '---' ? lines.indexOf('---', 1) : 0)
            .find((line) => /^title:/.test(line));
        if (!title) throw new Error(`Docs page has no title: ${ref}`);
        return title
            .replace(/^title:\s*/, '')
            .trim()
            .replace(/^["']|["']$/g, '');
    }
    const heading = lines.find(
        (line) =>
            /^#{1,6}\s/.test(line) &&
            slugify(line.replace(/^#+\s*/, '')) === anchor,
    );
    if (!heading) throw new Error(`Docs anchor not found: ${ref}`);
    return heading
        .replace(/^#+\s*/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/`/g, '')
        .trim();
};

export const docsParagraph = (ref: string): string => {
    const [relative, anchorWithRange] = ref.split('#');
    const [anchor, ...selectors] = anchorWithRange.split(':');
    const paragraphSelector = selectors.find((x) => /^p\d+$/.test(x));
    const itemSelector = selectors.find((x) => /^li\d+$/.test(x));
    const range = selectors.find((x) => /^\d+(-\d+)?$/.test(x));
    const paragraphIndex = paragraphSelector
        ? Number(paragraphSelector.slice(1))
        : 1;
    const file = path.join(docsDir, relative);
    const lines = readFileSync(file, 'utf8').split('\n');
    // `intro` is the page's own introduction: the text between the
    // frontmatter and the first heading, which has no anchor of its own.
    const frontmatterEnd = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
    const headingIndex =
        anchor === 'intro'
            ? frontmatterEnd
            : lines.findIndex(
                  (line) =>
                      /^#{1,6}\s/.test(line) &&
                      slugify(line.replace(/^#+\s*/, '')) === anchor,
              );
    if (headingIndex === -1) {
        throw new Error(`Docs anchor not found: ${ref}`);
    }
    // Prose paragraphs under the heading, skipping image/JSX blocks.
    const paragraphs: string[][] = [];
    let current: string[] = [];
    for (const line of lines.slice(headingIndex + 1)) {
        if (/^#{1,6}\s/.test(line)) break;
        if (line.trim() === '') {
            if (current.length > 0) paragraphs.push(current);
            current = [];
        } else {
            current.push(line.trim());
        }
    }
    if (current.length > 0) paragraphs.push(current);
    // Prose only: skip image/JSX blocks and bullet or numbered lists (a
    // paragraph that merely starts with bold text is prose).
    const prose = paragraphs.filter(
        (para) =>
            !/^[<!]/.test(para[0]) && !/^\s*(?:[-*]\s|\d+\.\s)/.test(para[0]),
    );
    // A list item, counted across the section's lists in order.
    const items = paragraphs
        .flatMap((para) => para)
        .filter((line) => /^\s*(?:[-*]\s|\d+\.\s)/.test(line))
        .map((line) => line.replace(/^\s*(?:[-*]\s|\d+\.\s)/, ''));
    const paragraph = itemSelector
        ? (() => {
              const item = items[Number(itemSelector.slice(2)) - 1];
              if (!item) {
                  throw new Error(
                      `${ref}: list item ${itemSelector.slice(2)} not found (${items.length} items)`,
                  );
              }
              return [item];
          })()
        : prose[paragraphIndex - 1];
    if (!paragraph) {
        throw new Error(
            `${ref}: paragraph ${paragraphIndex} not found (${prose.length} prose paragraphs)`,
        );
    }
    // Docs markdown the host renders: links stay links, resolved to the
    // published docs site, and code spans become bold (they are product
    // labels in these docs). Links are parked while sentences are split so
    // the dots in a URL do not read as sentence ends.
    const links: string[] = [];
    const text = paragraph
        .join(' ')
        .replace(
            /\[([^\]]+)\]\(([^)]*)\)/g,
            (_, label: string, href: string) => {
                links.push(docsUrl(relative, href));
                return `[${label}](§${links.length - 1})`;
            },
        )
        // Double backticks are a code span too (the docs use them inside
        // link labels).
        // Markdown escapes (`\\>` for a literal >) read as the character.
        .replace(/\\([>_*#])/g, '$1')
        .replace(/``([^`]+)``/g, '**$1**')
        .replace(/`([^`]+)`/g, '**$1**')
        // Bold italics read as bold in a card; plain italics as plain text.
        .replace(/\*\*\*([^*]+)\*\*\*/g, '**$1**')
        .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1$2');
    const restoreLinks = (x: string) =>
        x.replace(/\(§(\d+)\)/g, (_, i: string) => `(${links[Number(i)]})`);
    if (!range) return restoreLinks(text);
    // A sentence may close inside bold (`...access to it.**`); a dot with
    // no space after it (`table_name.field_name`) is inside a word.
    // A paragraph with no closing punctuation at all (a one-line docs step
    // such as "Give your agent a memorable name") is its own sentence.
    const sentences =
        text
            .match(
                /(?:[^.!?]|[.!?](?!(?:\*\*)?(?:\s|$)))+[.!?]+(?:\*\*)?(?:\s|$)/g,
            )
            ?.map((x) => x.trim()) ??
        (/[.!?]/.test(text) ? undefined : [text.trim()]);
    if (!sentences) throw new Error(`No sentences found under ${ref}`);
    const [from, to] = range.split('-').map(Number);
    const picked = sentences.slice(from - 1, to ?? from);
    // A sentence lifted from mid-paragraph may open with a connector that
    // points back at text the card does not show ("Either way, ..."); drop
    // it and capitalise what follows. Only these, and only at the start.
    if (from > 1 && picked.length > 0) {
        for (const connector of LEADING_CONNECTORS) {
            if (picked[0].startsWith(connector)) {
                const rest = picked[0].slice(connector.length);
                picked[0] = rest.charAt(0).toUpperCase() + rest.slice(1);
                break;
            }
        }
    }
    if (picked.length === 0) {
        throw new Error(
            `${ref}: sentence range out of bounds (${sentences.length} sentences)`,
        );
    }
    return restoreLinks(picked.join(' '));
};

export const selectorFor = (marker: Marker) =>
    marker.step !== undefined
        ? `[data-tour-scope="${marker.scope}"][data-tour-step="${marker.step}"]`
        : marker.look !== undefined
          ? `[data-tour-scope="${marker.scope}"][data-tour-look="${marker.look}"]`
          : `[data-tour-scope="${marker.scope}"][data-tour-result="${marker.result}"]`;

export type ScopeTourStepDefinition = {
    target: string;
    route?: string;
    title: string;
    body: string;
    interactive: boolean;
    advanceOnTargetClick: boolean;
    advanceOnTargetInput: boolean;
    via: string[];
    /**
     * Optional hops on the way to `target`: controls that lead to it on the
     * instances that show them. Spotlit, with their own title, while one is
     * on the page and the target is not.
     */
    detour?: { target: string; title: string }[];
    /** The page's "still working" surface; the step waits for it to go. */
    busy?: string;
    /** For a typed step: what the card offers to fill in with one click. */
    suggestion?: string;
};

export type ScopeTourDefinition = {
    scope: string;
    title: string;
    /** Frontend files whose markers produced the steps. */
    sources: string[];
    steps: ScopeTourStepDefinition[];
};

export type ScopeTourBuild = {
    tours: ScopeTourDefinition[];
    markers: Marker[];
    files: string[];
};

/**
 * Every walkthrough the markers describe. Throws on the first inconsistency
 * (the generator stops; the checker reports it with the file it came from).
 */
export const buildTours = (
    files: string[] = listTsx(frontendSrc),
): ScopeTourBuild => {
    const markers = files.flatMap(findMarkers);
    const scopes = new Map(
        getScopes({ isEnterprise: true }).map((scope) => [scope.name, scope]),
    );
    const byScope = new Map<string, Marker[]>();
    markers.forEach((marker) => {
        if (!scopes.has(marker.scope)) {
            throw new Error(
                `${marker.file}: unknown scope ${marker.scope} in data-tour-scope`,
            );
        }
        byScope.set(marker.scope, [
            ...(byScope.get(marker.scope) ?? []),
            marker,
        ]);
    });

    const tours = [...byScope.entries()].map(([scope, scopeMarkers]) => {
        // The same surface can be rendered by more than one component (e.g.
        // two homepage variants). Markers that agree on step, route, label and
        // docs are alternates of one step; the selector matches whichever is
        // on the page. Markers that disagree on the same step are an error.
        const byStep = new Map<number, Marker>();
        const byResult = new Map<number, Marker>();
        const byLook = new Map<number, Marker>();
        const sources = new Set<string>();
        const agrees = (a: Marker, b: Marker) =>
            a.route === b.route &&
            a.label === b.label &&
            a.docs === b.docs &&
            a.interactive === b.interactive &&
            a.via === b.via &&
            a.then === b.then &&
            a.return === b.return;
        [...scopeMarkers]
            .sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
            .forEach((marker) => {
                sources.add(marker.file);
                const isLook = marker.look !== undefined;
                const isResult = !isLook && marker.step === undefined;
                const key = isLook
                    ? marker.look!
                    : isResult
                      ? marker.result!
                      : marker.step!;
                const group = isLook ? byLook : isResult ? byResult : byStep;
                const existing = group.get(key);
                if (!existing) {
                    group.set(key, marker);
                    return;
                }
                if (!agrees(existing, marker)) {
                    throw new Error(
                        `${scope}: ${isLook ? 'data-tour-look' : isResult ? 'data-tour-result' : 'data-tour-step'} ${key} is defined differently in ${existing.file} and ${marker.file}`,
                    );
                }
            });
        // Further surfaces of the result, each worth its own look, in order.
        const resultLooks = [...byResult.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, marker]) => marker);
        const ordered = [...byStep.values()];
        // Looks taken on the way (a tile while the dashboard can still be
        // edited): a read step right after the path click each one names.
        const lookStep = (marker: Marker) => {
            if (!marker.label || !marker.after) {
                throw new Error(
                    `${marker.file}: data-tour-look ${marker.look} needs data-tour-label and data-tour-after`,
                );
            }
            return {
                target: selectorFor(marker),
                route: marker.route,
                title: marker.label,
                body: marker.docs ? docsParagraph(marker.docs) : '',
                // A hands-on look (data-tour-interactive) lets the learner
                // use the surface; Next moves on either way.
                interactive: marker.interactive,
                advanceOnTargetClick: false,
                advanceOnTargetInput: false,
                via: [],
            };
        };
        const looksAfter = (selector: string) =>
            [...byLook.values()]
                .filter((marker) => marker.after === selector)
                .sort((a, b) => a.look! - b.look!)
                .map(lookStep);
        // One step per click. A marker's path expands into a step for each
        // control on it, each titled by that control's hint; every step keeps
        // the controls before it as fallbacks, so if a menu closes the
        // spotlight drops back to the control that reopens it.
        // Optional hops fold into the step of the next required control.
        const detourFor = (hops: PathHop[]) =>
            hops.length > 0
                ? {
                      detour: hops.map((hop) => ({
                          target: hop.selector,
                          title: hintFor(hop.selector, files),
                      })),
                  }
                : {};
        const required = (path: PathHop[]) =>
            path.filter((hop) => !hop.optional).map((hop) => hop.selector);
        // The optional hops left over after the last required control: they
        // belong to whatever step follows the path (the marker's own).
        const trailing = (path: PathHop[]) => {
            const pending: PathHop[] = [];
            for (const hop of path) {
                if (hop.optional) pending.push(hop);
                else pending.length = 0;
            }
            return pending;
        };
        const pathSteps = (path: PathHop[], route?: string) => {
            const pending: PathHop[] = [];
            return path.flatMap((hop) => {
                if (hop.optional) {
                    pending.push(hop);
                    return [];
                }
                const { selector } = hop;
                const typed = isInputAnchor(selector, files);
                const suggestion = typed
                    ? suggestionFor(selector, files)
                    : undefined;
                const step = {
                    target: selector,
                    route,
                    title: hintFor(selector, files),
                    body: '',
                    interactive: true,
                    advanceOnTargetClick: !typed,
                    advanceOnTargetInput: typed,
                    via: required(path.slice(0, path.indexOf(hop))),
                    ...detourFor(pending.splice(0)),
                    ...(suggestion ? { suggestion } : {}),
                };
                return [step, ...looksAfter(selector)];
            });
        };
        // A path that ends on an optional hop (`then`, `return`) has no step
        // after it to carry the detour.
        const closedPath = (marker: Marker, attribute: 'then' | 'return') => {
            const path = parsePath(marker[attribute]);
            if (trailing(path).length > 0) {
                throw new Error(
                    `${marker.file}: data-tour-${attribute} ends on an optional hop (?); an optional hop needs a control after it to detour to`,
                );
            }
            return path;
        };
        const steps = ordered.flatMap((marker) => {
            const path = parsePath(marker.via);
            return [
                ...pathSteps(path, marker.route),
                {
                    target: selectorFor(marker),
                    route: marker.route,
                    // The intro step (the result marker, step 1) is titled
                    // by the docs it cites; action steps keep their own
                    // imperative labels ("Click Pin to homepage").
                    title:
                        marker.step === 1 && marker.docs
                            ? docsHeading(marker.docs)
                            : (marker.label ?? scopes.get(scope)!.description),
                    body: marker.docs
                        ? docsParagraph(marker.docs)
                        : scopes.get(scope)!.description,
                    interactive: marker.interactive,
                    advanceOnTargetClick: marker.interactive,
                    advanceOnTargetInput: false,
                    via: required(path),
                    ...detourFor(trailing(path)),
                },
                // Clicks that complete the action after the marked control
                // (a confirmation), each its own step.
                ...pathSteps(closedPath(marker, 'then'), marker.route),
            ];
        });
        // Close where the walkthrough began so the learner sees the result of
        // what they did. They walk back themselves, along the result marker's
        // return path (the home link unless it says otherwise).
        const first = ordered[0];
        const homePath =
            first.return === 'none'
                ? []
                : first.return
                  ? closedPath(first, 'return')
                  : parsePath('[data-tour-nav="home"]');
        steps.push(...pathSteps(homePath, first.route), {
            target: selectorFor(first),
            route: first.route,
            title: 'See the result',
            body: first.resultDocs ? docsParagraph(first.resultDocs) : '',
            interactive: false,
            advanceOnTargetClick: false,
            advanceOnTargetInput: false,
            via: required(homePath),
            ...(first.busy ? { busy: first.busy } : {}),
        });
        resultLooks.forEach((marker) => {
            if (!marker.label) {
                throw new Error(
                    `${marker.file}: data-tour-result ${marker.result} needs a data-tour-label`,
                );
            }
            steps.push({
                target: selectorFor(marker),
                route: marker.route ?? first.route,
                title: marker.label,
                body: marker.docs ? docsParagraph(marker.docs) : '',
                interactive: false,
                advanceOnTargetClick: false,
                advanceOnTargetInput: false,
                via: [],
            });
        });
        return {
            scope,
            title:
                ordered.find((marker) => marker.step === 2)?.title ??
                scopes.get(scope)!.description,
            sources: [...sources],
            steps,
        };
    });

    const primaryTours = new Map(tours.map((tour) => [tour.scope, tour]));
    const coveredBy = new Map<string, string>();
    for (const marker of markers) {
        for (const covered of marker.covers ?? []) {
            if (!scopes.has(covered)) {
                throw new Error(
                    `${marker.file}: unknown scope ${covered} in data-tour-covers`,
                );
            }
            if (marker.step !== 2 || !marker.interactive) {
                throw new Error(
                    `${marker.file}: data-tour-covers belongs on the interactive action marker`,
                );
            }
            if (
                primaryTours.has(covered) ||
                (coveredBy.has(covered) &&
                    coveredBy.get(covered) !== marker.scope)
            ) {
                throw new Error(
                    `${marker.file}: duplicate walkthrough coverage for ${covered}`,
                );
            }
            if (coveredBy.has(covered)) continue;
            coveredBy.set(covered, marker.scope);
            tours.push({ ...primaryTours.get(marker.scope)!, scope: covered });
        }
    }
    return { tours, markers, files };
};
