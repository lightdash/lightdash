/**
 * Generation checks for scope walkthroughs (CS-209): everything the first
 * modules settled by hand, enforced. Runs over the markers in the frontend
 * and the walkthroughs they produce; fails with `file:line: message` on:
 *
 *   - a marker whose scope is not in the scope registry, or a step reused
 *     with a different route, label, docs or path (from the builder)
 *   - a path selector that does not resolve to an anchor with a hint
 *   - a docs anchor that does not exist, or a sentence out of range
 *   - a step with no docs sentence that is not a pure click step
 *   - a title over 12 words, a body over 60 words, a body that lost the
 *     bold product name the docs sentence has
 *   - a typed step (the learner never types)
 *   - a scope with no result marker, or a homepage result marker missing
 *     from one of the two homepage components
 *   - a route that is not a known project route
 *   - an interactive last step without an explicit result-then path
 *   - a busy selector or result look that is not an anchor in the frontend
 *
 * Duplicate titles within a tour are reported as warnings: a walkthrough may
 * legitimately pass the same control on the way back.
 *
 * Usage: pnpm scope-tours:check [--json]   (LIGHTDASH_DOCS_DIR as for generate)
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
    buildTours,
    docsDir,
    findBlockEnd,
    findMarkers,
    frontendSrc,
    listTsx,
    parsePath,
    PATH_SELECTOR,
    root,
    type Marker,
    type ScopeTourDefinition,
} from './lib';

export type Finding = {
    level: 'error' | 'warning';
    file: string;
    line?: number;
    message: string;
};

const HOMEPAGE_COMPONENTS = [
    'packages/frontend/src/components/PinnedItemsPanel/index.tsx',
    'packages/frontend/src/ee/features/homepageBuilder/DayOneHomepage.tsx',
];
const TITLE_MAX_WORDS = 12;
const BODY_MAX_WORDS = 60;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/** Where an anchor selector is declared in the frontend, if anywhere. */
export const locateAnchor = (
    selector: string,
    files: string[],
): { file: string; line: number; block: string } | null => {
    const match = selector.match(PATH_SELECTOR);
    if (!match) return null;
    const [, attribute, value] = match;
    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        // A declaration is preceded by whitespace; the same text inside a
        // path attribute (`data-tour-via='[data-tour-nav="x"] >> ...'`) is
        // preceded by `[` and is a use, not a declaration.
        const at = [
            ...source.matchAll(
                new RegExp(
                    `(?<=\\s)(?:${attribute}="${value}"|'${attribute}': '${value}')`,
                    'g',
                ),
            ),
        ].map((m) => m.index ?? -1)[0];
        if (at === undefined || at === -1) continue;
        const start = Math.max(
            source.lastIndexOf('<', at),
            source.lastIndexOf('{', at),
        );
        return {
            file: path.relative(root, file),
            line: source.slice(0, at).split('\n').length,
            block: source.slice(start, findBlockEnd(source, at)),
        };
    }
    return null;
};

/** Route path patterns declared in the frontend routers, params normalised. */
const knownRoutePieces = (): Set<string> => {
    const pieces = new Set<string>();
    for (const relative of [
        'packages/frontend/src/Routes.tsx',
        'packages/frontend/src/ee/CommercialRoutes.tsx',
    ]) {
        const file = path.join(root, relative);
        if (!existsSync(file)) continue;
        for (const match of readFileSync(file, 'utf8').matchAll(
            /path:\s*'([^']+)'/g,
        )) {
            pieces.add(
                match[1].replace(/^\//, '').replace(/:[A-Za-z]+/g, ':p'),
            );
        }
    }
    return pieces;
};

const segmentMatches = (pattern: string, segment: string | undefined) =>
    pattern === ':p?' ||
    (segment !== undefined && (pattern === ':p' || pattern === segment));

/**
 * Whether the segments from `at` can be covered by declared route pieces in
 * sequence (a parent path followed by its children), params matching any
 * segment and optional params matching none.
 */
const coveredBy = (
    segments: string[],
    at: number,
    pieces: string[][],
): boolean => {
    if (at >= segments.length) return true;
    // A route starts with a literal piece; pieces made only of params are
    // children (`:mode?` under `dashboards/:dashboardUuid`), never a start.
    const candidates =
        at === 0 ? pieces.filter((piece) => !piece[0].startsWith(':')) : pieces;
    return candidates.some((piece) => {
        let cursor = at;
        for (const pattern of piece) {
            if (segmentMatches(pattern, segments[cursor])) {
                if (
                    pattern === ':p?' &&
                    (segments[cursor] === undefined ||
                        segments[cursor].startsWith('!'))
                )
                    continue;
                cursor += 1;
            } else if (pattern === ':p?') {
                continue;
            } else {
                return false;
            }
        }
        return cursor > at && coveredBy(segments, cursor, pieces);
    });
};

const isKnownRoute = (route: string, pieceSet: Set<string>): boolean => {
    const tail = route
        .replace(/^\/projects\/:projectUuid\/?/, '')
        .replace(/:[A-Za-z]+/g, ':p');
    if (tail === '') return true;
    const pieces = [...pieceSet]
        .map((piece) => piece.replace(/^projects\/:p\/?/, ''))
        .filter((piece) => piece !== '')
        .map((piece) => piece.split('/'));
    return coveredBy(tail.split('/'), 0, pieces);
};

/** The raw docs sentence(s) a citation points at, with markdown intact. */
const rawDocsHasBold = (ref: string): boolean => {
    const [relative] = ref.split('#');
    const file = path.join(docsDir, relative);
    if (!existsSync(file)) return false;
    return /\*\*[^*]+\*\*|`[^`]+`/.test(readFileSync(file, 'utf8'));
};

export const checkTours = (
    files: string[] = listTsx(frontendSrc),
): Finding[] => {
    const findings: Finding[] = [];
    const error = (file: string, message: string, line?: number) =>
        findings.push({ level: 'error', file, line, message });
    const warn = (file: string, message: string, line?: number) =>
        findings.push({ level: 'warning', file, line, message });

    let tours: ScopeTourDefinition[] = [];
    let markers: Marker[] = [];
    try {
        ({ tours, markers } = buildTours(files));
    } catch (caught) {
        const message = (caught as Error).message;
        // The builder names the file when it has one; hint and docs errors
        // name the selector or anchor, which the checks below locate.
        const named = message.match(/^(packages\/[^:]+):\s*(.*)$/);
        error(
            named ? named[1] : 'scripts/scope-tours',
            named ? named[2] : message,
        );
        // Keep going with what can still be checked marker by marker.
        markers = files.flatMap(findMarkers);
    }

    const pieces = knownRoutePieces();
    const byScope = new Map<string, Marker[]>();
    markers.forEach((marker) =>
        byScope.set(marker.scope, [
            ...(byScope.get(marker.scope) ?? []),
            marker,
        ]),
    );

    // Marker-level checks (independent of a successful build).
    for (const [scope, scopeMarkers] of byScope) {
        const result = scopeMarkers.filter((m) => m.step === 1);
        if (result.length === 0) {
            error(
                scopeMarkers[0].file,
                `${scope}: no result marker (data-tour-step="1") shows where the change appears`,
                scopeMarkers[0].line,
            );
        }
        const onHomepage = result.filter((m) =>
            HOMEPAGE_COMPONENTS.includes(m.file),
        );
        if (
            onHomepage.length > 0 &&
            onHomepage.length < HOMEPAGE_COMPONENTS.length
        ) {
            const missing = HOMEPAGE_COMPONENTS.filter(
                (f) => !onHomepage.some((m) => m.file === f),
            );
            error(
                onHomepage[0].file,
                `${scope}: the homepage result marker is missing from ${missing.join(', ')} (both homepage variants must carry it)`,
                onHomepage[0].line,
            );
        }
        for (const marker of scopeMarkers) {
            if (marker.route && !isKnownRoute(marker.route, pieces)) {
                error(
                    marker.file,
                    `${scope}: data-tour-route "${marker.route}" is not a known project route`,
                    marker.line,
                );
            }
            for (const [attribute, value] of [
                ['via', marker.via],
                ['then', marker.then],
                ['return', marker.return],
                ['resultthen', marker.resultThen],
            ] as const) {
                if (!value || value === 'none') continue;
                const hops = parsePath(value);
                if (
                    (attribute === 'then' || attribute === 'resultthen') &&
                    hops[hops.length - 1]?.optional
                ) {
                    error(
                        marker.file,
                        `${scope}: data-tour-${attribute} ends on an optional hop (?); an optional hop needs a control after it to detour to`,
                        marker.line,
                    );
                }
                for (const { selector } of hops) {
                    const at = locateAnchor(selector, files);
                    if (!at) {
                        error(
                            marker.file,
                            `${scope}: data-tour-${attribute} selector ${selector} does not resolve to a data-tour-nav or data-tour-anchor in the frontend`,
                            marker.line,
                        );
                        continue;
                    }
                    const hasHint =
                        /data-tour-hint=|'data-tour-hint'/.test(at.block) ||
                        /data-tour-hint="/.test(
                            readFileSync(
                                path.join(root, at.file),
                                'utf8',
                            ).split('\n')[at.line - 1] ?? '',
                        );
                    if (!hasHint) {
                        error(
                            at.file,
                            `${selector} has no data-tour-hint; its step would be titled generically (used by ${scope} in ${marker.file})`,
                            at.line,
                        );
                    }
                    if (
                        /data-tour-input="true"/.test(at.block) &&
                        !/data-tour-suggest="[^"]+"/.test(at.block)
                    ) {
                        error(
                            at.file,
                            `${selector} is a typed field with no data-tour-suggest; the card must offer something to type (or the product a default)`,
                            at.line,
                        );
                    }
                }
            }
            if (marker.busy && !marker.busy.match(PATH_SELECTOR)) {
                error(
                    marker.file,
                    `${scope}: data-tour-busy must be a data-tour-anchor selector`,
                    marker.line,
                );
            }
            if (
                marker.busy &&
                !files.some((f) =>
                    readFileSync(f, 'utf8').includes(
                        marker.busy!.match(PATH_SELECTOR)![2],
                    ),
                )
            ) {
                error(
                    marker.file,
                    `${scope}: data-tour-busy anchor ${marker.busy} is not declared anywhere in the frontend`,
                    marker.line,
                );
            }
            if (marker.step === 1 && !marker.docs) {
                error(
                    marker.file,
                    `${scope}: the result marker needs data-tour-docs (the walkthrough opens with it)`,
                    marker.line,
                );
            }
            if (marker.step === 2 && !marker.title) {
                warn(
                    marker.file,
                    `${scope}: the action marker has no data-tour-title; the library card falls back to the scope's description`,
                    marker.line,
                );
            }
            if (
                marker.step !== undefined &&
                marker.step > 1 &&
                marker.interactive &&
                !marker.docs
            ) {
                error(
                    marker.file,
                    `${scope}: the action marker needs data-tour-docs (the sentence naming the control)`,
                    marker.line,
                );
            }
            if (marker.look !== undefined && !marker.after) {
                error(
                    marker.file,
                    `${scope}: data-tour-look ${marker.look} needs data-tour-after (the path click it follows)`,
                    marker.line,
                );
            }
            if (
                marker.look !== undefined &&
                marker.after &&
                !scopeMarkers.some(
                    (m) =>
                        m.via?.includes(marker.after!) ||
                        m.then?.includes(marker.after!),
                )
            ) {
                error(
                    marker.file,
                    `${scope}: data-tour-after ${marker.after} is not on any path of this walkthrough`,
                    marker.line,
                );
            }
            if (marker.look !== undefined && !marker.docs) {
                error(
                    marker.file,
                    `${scope}: data-tour-look ${marker.look} needs data-tour-docs`,
                    marker.line,
                );
            }
            if (marker.result !== undefined && !marker.docs) {
                error(
                    marker.file,
                    `${scope}: data-tour-result ${marker.result} needs data-tour-docs`,
                    marker.line,
                );
            }
            for (const ref of [marker.docs, marker.resultDocs].filter(
                (x): x is string => !!x,
            )) {
                const [relative] = ref.split('#');
                if (!existsSync(path.join(docsDir, relative))) {
                    error(
                        marker.file,
                        `${scope}: docs page ${relative} not found under ${docsDir}`,
                        marker.line,
                    );
                }
            }
        }
    }

    // Tour-level checks (what the learner will actually see).
    for (const tour of tours) {
        const first = markers.find(
            (m) => m.scope === tour.scope && m.step === 1,
        );
        const file =
            first?.file ??
            'packages/frontend/src/features/scopeTours/generated.ts';
        const seen = new Map<string, number>();
        tour.steps.forEach((step, index) => {
            const where = `${tour.scope} step ${index + 1} ("${step.title}")`;
            if (words(step.title).length > TITLE_MAX_WORDS) {
                error(
                    file,
                    `${where}: title is over ${TITLE_MAX_WORDS} words`,
                    first?.line,
                );
            }
            if (words(step.body).length > BODY_MAX_WORDS) {
                error(
                    file,
                    `${where}: body is over ${BODY_MAX_WORDS} words; cite fewer sentences`,
                    first?.line,
                );
            }
            if (step.advanceOnTargetInput && !step.suggestion) {
                error(
                    file,
                    `${where}: is a typed step with nothing suggested on the card`,
                    first?.line,
                );
            }
            if (
                !step.advanceOnTargetClick &&
                !step.advanceOnTargetInput &&
                step.body === '' &&
                index !== 0
            ) {
                error(
                    file,
                    `${where}: a step the learner reads (not a click) has no docs sentence`,
                    first?.line,
                );
            }
            if (/click the highlighted/i.test(step.title)) {
                error(file, `${where}: generic title`, first?.line);
            }
            seen.set(step.title, (seen.get(step.title) ?? 0) + 1);
        });
        for (const [title, count] of seen) {
            if (count > 1)
                warn(
                    file,
                    `${tour.scope}: title "${title}" appears ${count} times`,
                    first?.line,
                );
        }
        const last = tour.steps[tour.steps.length - 1];
        if (
            (last?.advanceOnTargetClick || last?.interactive) &&
            !first?.resultThen
        ) {
            error(
                file,
                `${tour.scope}: the last step must be a look (Got it), not a click`,
                first?.line,
            );
        }
        // Bold survives citation: a docs sentence with a product name in bold
        // or code keeps it on the card.
        const cited = markers.filter((m) => m.scope === tour.scope);
        for (const marker of cited) {
            for (const ref of [marker.docs, marker.resultDocs].filter(
                (x): x is string => !!x,
            )) {
                if (
                    rawDocsHasBold(ref) &&
                    tour.steps.every((s) => !s.body.includes('**')) &&
                    ref.includes('**')
                ) {
                    warn(
                        marker.file,
                        `${tour.scope}: the docs bold a product name but no step body keeps it`,
                        marker.line,
                    );
                }
            }
        }
    }

    // Anchors declared without a hint anywhere in the frontend (unused today,
    // but the next walkthrough will use them). Busy surfaces are not clicked
    // and need none.
    const busyValues = new Set(
        markers
            .map((m) => m.busy?.match(PATH_SELECTOR)?.[2])
            .filter((x): x is string => !!x),
    );
    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(
            /(?<=\s)data-tour-(nav|anchor)="([^"]+)"/g,
        )) {
            if (busyValues.has(match[2])) continue;
            const at = match.index ?? 0;
            const start = Math.max(
                source.lastIndexOf('<', at),
                source.lastIndexOf('{', at),
            );
            const block = source.slice(start, findBlockEnd(source, at));
            const line = source.slice(0, at).split('\n').length;
            const lineText = source.split('\n')[line - 1] ?? '';
            const hinted =
                /data-tour-hint=|'data-tour-hint'/.test(block) ||
                /data-tour-hint="/.test(lineText);
            if (!hinted) {
                warn(
                    path.relative(root, file),
                    `data-tour-${match[1]}="${match[2]}" has no data-tour-hint`,
                    line,
                );
            }
        }
    }
    return findings;
};

const main = () => {
    const json = process.argv.includes('--json');
    const findings = checkTours();
    const errors = findings.filter((f) => f.level === 'error');
    if (json) {
        console.log(JSON.stringify(findings, null, 2));
    } else {
        for (const f of findings) {
            console.log(
                `${f.file}${f.line ? `:${f.line}` : ''}: ${f.level}: ${f.message}`,
            );
        }
        console.log(
            `${errors.length} error(s), ${findings.length - errors.length} warning(s)`,
        );
    }
    process.exit(errors.length > 0 ? 1 : 0);
};

if (require.main === module) main();
