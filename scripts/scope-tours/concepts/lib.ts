import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ConceptLesson } from '../../../packages/frontend/src/features/learn/conceptLesson';
export type ConceptSource = {
    file: string;
    heading: string;
    includeSubsections?: boolean;
};
export type ConceptManifest = {
    scopes: string[];
    title: string;
    sources: ConceptSource[];
}[];

export const extractSection = (
    markdown: string,
    heading: string,
    includeSubsections = true,
): string => {
    const lines = markdown.split('\n');
    let fenced = false;
    let start = -1;
    let level = 0;
    let end = lines.length;
    for (let i = 0; i < lines.length; i += 1) {
        if (/^\s*```/.test(lines[i])) fenced = !fenced;
        if (fenced) continue;
        const match = /^(#{1,6}) (.+)$/.exec(lines[i]);
        if (!match) continue;
        if (start < 0 && match[2] === heading) {
            start = i + 1;
            level = match[1].length;
        } else if (
            start >= 0 &&
            (!includeSubsections || match[1].length <= level)
        ) {
            end = i;
            break;
        }
    }
    if (start < 0) throw new Error(`Missing docs section: ${heading}`);
    const body = lines
        .slice(start, end)
        .join('\n')
        .replace(/<Frame>[\s\S]*?<\/Frame>/g, '')
        .replace(/^\s*<[^>]+>\s*$/gm, '')
        .replace(/<\/?Badge\b[^>]*>/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\]\(\/(?!\/)/g, '](https://docs.lightdash.com/')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (!body) throw new Error(`Empty docs section: ${heading}`);
    return body;
};

export const buildConcepts = (
    docsRoot: string,
    manifest: ConceptManifest,
): Record<string, ConceptLesson> => {
    const result: Record<string, ConceptLesson> = {};
    for (const lesson of manifest) {
        const sections = lesson.sources.map(
            ({ file, heading, includeSubsections }) => {
                const source = readFileSync(path.join(docsRoot, file), 'utf8');
                const slug = heading
                    .toLowerCase()
                    .replace(/[^\w\s-]/g, '')
                    .replace(/\s+/g, '-');
                return {
                    heading: heading.replace(/`/g, ''),
                    body: extractSection(
                        source,
                        heading,
                        includeSubsections,
                    ).replace(/\]\(([^\s)]+)\)/g, (match, href: string) => {
                        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return match;
                        const url = new URL(
                            href,
                            `https://docs.lightdash.com/${file.replace(/\.mdx$/, '')}`,
                        );
                        url.pathname = url.pathname.replace(/\.mdx$/, '');
                        return `](${url.href})`;
                    }),
                    sourceUrl: `https://docs.lightdash.com/${file.replace(/\.mdx$/, '')}#${slug}`,
                    sourceLabel: heading.replace(/`/g, ''),
                    sourceHash: createHash('sha256')
                        .update(source)
                        .digest('hex'),
                };
            },
        );
        for (const scope of lesson.scopes) {
            if (result[scope])
                throw new Error(`Duplicate concept scope: ${scope}`);
            result[scope] = {
                title: lesson.title,
                coveredScopes: lesson.scopes,
                sections,
            };
        }
    }
    return result;
};
