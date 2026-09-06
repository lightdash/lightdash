/**
 * Suggestions for what a walkthrough author used to pick by hand (CS-209):
 *
 *   - a hint for every anchor on a scope's paths that has none, derived from
 *     the control's own text or aria-label ("Click Browse", "Open All Spaces")
 *   - docs anchors for a marker that cites none: the docs sections whose
 *     sentences mention the control's label, with the sentence number
 *
 * Proposals are printed (or written with --write <file>) for the author to
 * accept as attributes; nothing is applied. Path discovery and result-marker
 * discovery are not automated: both need the rendered React tree, which the
 * runtime smoke (smoke.ts) exercises instead.
 *
 * Usage: pnpm scope-tours:suggest -- --scope manage:Dashboard [--write out.json]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { locateAnchor } from './check';
import {
    docsDir,
    findMarkers,
    frontendSrc,
    listTsx,
    PATH_SELECTOR,
    root,
    type Marker,
} from './lib';

type Proposal = {
    kind: 'hint' | 'docs';
    file: string;
    line?: number;
    selector?: string;
    /** For hints: the attribute to add; for docs: candidate citations. */
    suggestion: string | string[];
    from: string;
};

/** The visible words of a JSX block: its text children or aria-label. */
const controlText = (block: string, source: string, at: number): string => {
    const aria = block.match(/aria-label=(?:"([^"]*)"|\{'([^']*)'\})/);
    if (aria) return aria[1] ?? aria[2];
    // Text between the opening tag and the next tag.
    const after = source.slice(at);
    const close = after.indexOf('>');
    const text = after.slice(close + 1).match(/^\s*([^<{]+?)\s*</)?.[1];
    return text?.trim() ?? '';
};

const hintFrom = (text: string, block: string): string | null => {
    if (!text) return null;
    const opens = /Menu\.Target|Popover\.Target|aria-haspopup|Menu\.Item/.test(
        block,
    );
    return `${opens ? 'Open' : 'Click'} ${text}`;
};

const listMdx = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) return listMdx(full);
        return full.endsWith('.mdx') ? [full] : [];
    });

const slugify = (heading: string) =>
    heading
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

/** Docs sentences that mention the words, as `file#anchor:n` citations. */
const docsCitationsFor = (needle: string): string[] => {
    const wanted = needle.toLowerCase();
    const found: string[] = [];
    for (const file of listMdx(docsDir)) {
        const lines = readFileSync(file, 'utf8').split('\n');
        let anchor = 'intro';
        let prose: string[] = [];
        const flush = () => {
            const text = prose.join(' ').replace(/`([^`]+)`/g, '**$1**');
            const sentences =
                text.match(/[^.!?]+[.!?]+(?:\*\*)?(?:\s|$)/g) ?? [];
            sentences.forEach((sentence, index) => {
                if (sentence.toLowerCase().includes(wanted)) {
                    found.push(
                        `${path.relative(docsDir, file)}#${anchor}:${index + 1}`,
                    );
                }
            });
            prose = [];
        };
        for (const line of lines) {
            if (/^#{1,6}\s/.test(line)) {
                flush();
                anchor = slugify(line.replace(/^#+\s*/, ''));
            } else if (line.trim() === '') {
                flush();
            } else if (
                !/^[<!]/.test(line) &&
                !/^\s*(?:[-*]\s|\d+\.\s)/.test(line)
            ) {
                prose.push(line.trim());
            }
        }
        flush();
    }
    return found.slice(0, 8);
};

export const suggestFor = (
    scope: string,
    files: string[] = listTsx(frontendSrc),
): Proposal[] => {
    const proposals: Proposal[] = [];
    const markers: Marker[] = files
        .flatMap(findMarkers)
        .filter((m) => m.scope === scope);
    if (markers.length === 0) {
        throw new Error(
            `${scope}: no markers found; place data-tour-scope markers first (see the add-scope-walkthrough skill)`,
        );
    }
    for (const marker of markers) {
        for (const value of [marker.via, marker.then, marker.return]) {
            if (!value || value === 'none') continue;
            for (const selector of value.split(' >> ').map((v) => v.trim())) {
                const at = locateAnchor(selector, files);
                if (!at || /data-tour-hint/.test(at.block)) continue;
                const absolute = path.join(root, at.file);
                const source = readFileSync(absolute, 'utf8');
                const offset = source
                    .split('\n')
                    .slice(0, at.line - 1)
                    .join('\n').length;
                const text = controlText(
                    at.block,
                    source,
                    source.indexOf(selector.match(PATH_SELECTOR)![2], offset),
                );
                const hint = hintFrom(text, at.block);
                proposals.push({
                    kind: 'hint',
                    file: at.file,
                    line: at.line,
                    selector,
                    suggestion: hint
                        ? `data-tour-hint="${hint}"`
                        : 'data-tour-hint="..." (no visible text found; name the action)',
                    from: text
                        ? `control text "${text}"`
                        : 'no accessible name',
                });
            }
        }
        if (!marker.docs) {
            const label = marker.label ?? '';
            const control = label.replace(
                /^(Click|Open|Choose|Select|Pick)\s+/i,
                '',
            );
            const citations = docsCitationsFor(control);
            proposals.push({
                kind: 'docs',
                file: marker.file,
                line: marker.line,
                suggestion:
                    citations.length > 0
                        ? citations
                        : [
                              `no docs sentence mentions "${control}"; the step will have no body until the docs do`,
                          ],
                from: `label "${label}"`,
            });
        }
    }
    return proposals;
};

const main = () => {
    const scopeAt = process.argv.indexOf('--scope');
    const scope = scopeAt === -1 ? undefined : process.argv[scopeAt + 1];
    if (!scope) {
        console.error(
            'Usage: pnpm scope-tours:suggest -- --scope <scope> [--write <file>]',
        );
        process.exit(2);
    }
    const proposals = suggestFor(scope);
    const writeAt = process.argv.indexOf('--write');
    if (writeAt !== -1) {
        writeFileSync(
            process.argv[writeAt + 1],
            `${JSON.stringify(proposals, null, 2)}\n`,
        );
    }
    for (const p of proposals) {
        const where = `${p.file}${p.line ? `:${p.line}` : ''}`;
        if (p.kind === 'hint') {
            console.log(
                `${where}: ${p.selector} → add ${p.suggestion} (from ${p.from})`,
            );
        } else {
            console.log(`${where}: no docs cited (${p.from}); candidates:`);
            for (const c of p.suggestion as string[])
                console.log(`    data-tour-docs="${c}"`);
        }
    }
    if (proposals.length === 0)
        console.log(
            `${scope}: nothing to suggest; every anchor has a hint and every marker cites the docs`,
        );
};

if (require.main === module) main();
