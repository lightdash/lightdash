import { compareReleaseVersions } from './releaseVersions';

export type ReleaseFeatureCandidate = {
    id: string;
    version: string;
    scope: string | null;
    text: string;
    number: number | null;
    url: string;
};

const getPullNumber = (text: string): number | null => {
    for (const match of text.matchAll(/https?:\/\/[^\s)<>\]]+/g)) {
        if (URL.canParse(match[0])) {
            const url = new URL(match[0]);
            const path = url.pathname.match(
                /^\/lightdash\/lightdash\/(?:issues|pull)\/(\d+)\/?$/,
            );
            if (url.hostname === 'github.com' && path) {
                const number = Number(path[1]);
                if (Number.isSafeInteger(number) && number > 0) return number;
            }
        }
    }
    return null;
};

const stripMarkdown = (text: string): string =>
    text
        .replace(/\(\[(?:#\d+|[a-f\d]{7,40})\]\([^)]*\)\)/gi, '')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\*\*|__|`/g, '')
        .replace(/\s+/g, ' ')
        .trim();

const candidate = (
    version: string,
    index: number,
    scope: string | null,
    text: string,
    number: number | null,
): ReleaseFeatureCandidate => ({
    id: number === null ? `${version}-${index}` : `pr-${number}`,
    version,
    scope,
    text: stripMarkdown(text),
    number,
    url:
        number === null
            ? `https://github.com/lightdash/lightdash/releases/tag/${version}`
            : `https://github.com/lightdash/lightdash/pull/${number}`,
});

const deduplicate = (
    candidates: ReleaseFeatureCandidate[],
): ReleaseFeatureCandidate[] => {
    const seen = new Set<number>();
    return candidates.filter((item) => {
        if (!item.text) return false;
        if (item.number === null) return true;
        if (seen.has(item.number)) return false;
        seen.add(item.number);
        return true;
    });
};

export const parseReleaseFeatureCandidates = (
    releases: { version: string; body: string }[],
): ReleaseFeatureCandidate[] => {
    const candidates: ReleaseFeatureCandidate[] = [];
    for (const { version, body } of releases
        .slice()
        .sort((left, right) =>
            compareReleaseVersions(right.version, left.version),
        )) {
        let inFeatures = false;
        let inFence = false;
        body.split(/\r?\n/).forEach((line, index) => {
            if (/^\s*(`{3,}|~{3,})/.test(line)) {
                inFence = !inFence;
                return;
            }
            if (inFence) return;
            if (/^\s*#{1,6}\s+/.test(line)) {
                inFeatures = /^\s*#{2,3}\s+features\s*#*\s*$/i.test(line);
                return;
            }
            const bullet = line.match(/^\s{0,3}[*+-]\s+(.+)$/);
            if (!inFeatures || !bullet) return;
            const scope = bullet[1].match(/^\*\*([^*]+):\*\*\s*/);
            candidates.push(
                candidate(
                    version,
                    index,
                    scope ? stripMarkdown(scope[1]) : null,
                    scope ? bullet[1].slice(scope[0].length) : bullet[1],
                    getPullNumber(bullet[1]),
                ),
            );
        });
    }
    return deduplicate(candidates);
};

export const parseCommitFeatureCandidates = (
    messages: string[],
    version: string,
): ReleaseFeatureCandidate[] =>
    deduplicate(
        messages
            .slice()
            .reverse()
            .flatMap((message, index) => {
                const line = message.split(/\r?\n/)[0];
                const feature = line.match(/^feat(?:\(([^)]+)\))?:\s*(.+)$/);
                if (!feature) return [];
                const pull = line.match(/\(#(\d+)\)\s*$/);
                const number = pull ? Number(pull[1]) : null;
                return [
                    candidate(
                        version,
                        index,
                        feature[1] ?? null,
                        feature[2].replace(/\s*\(#\d+\)\s*$/, ''),
                        number !== null &&
                            Number.isSafeInteger(number) &&
                            number > 0
                            ? number
                            : null,
                    ),
                ];
            }),
    );
