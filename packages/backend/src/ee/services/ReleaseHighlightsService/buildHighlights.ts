import { type ReleaseHighlight } from '@lightdash/common';
import { type CachedReleaseHighlights } from '../../models/ReleaseHighlightsModel';

export const buildHighlights = (
    cached: CachedReleaseHighlights,
    matches: { title: string; numbers: number[] }[],
): ReleaseHighlight[] => {
    const matchedTitles = new Map<number, string>();
    matches.forEach((match) => {
        match.numbers.forEach((number) => {
            if (!matchedTitles.has(number))
                matchedTitles.set(number, match.title);
        });
    });
    const candidates = new Map(
        cached.candidates.map((item) => [item.id, item]),
    );
    const requested = new Map<string, string>();
    cached.candidates.forEach((candidate) => {
        const number = [
            ...candidate.relatedNumbers,
            ...(candidate.number === null ? [] : [candidate.number]),
        ].find((relatedNumber) => matchedTitles.has(relatedNumber));
        if (number !== undefined && !requested.has(candidate.id))
            requested.set(candidate.id, matchedTitles.get(number)!);
    });
    const seen = new Set<string>();
    const ranked = cached.ranked.flatMap((entry) => {
        const candidate = candidates.get(entry.candidateId);
        if (!candidate || seen.has(candidate.id)) return [];
        seen.add(candidate.id);
        return [
            {
                title: entry.title,
                benefit: entry.benefit,
                url: candidate.url,
                version: candidate.version,
                requestedByYourOrganization: requested.has(candidate.id),
            },
        ];
    });
    const fallback = cached.candidates.flatMap((candidate) => {
        const title = requested.get(candidate.id);
        if (title === undefined || seen.has(candidate.id)) return [];
        seen.add(candidate.id);
        return [
            {
                title,
                benefit: (
                    candidate.text.charAt(0).toUpperCase() +
                    candidate.text.slice(1)
                ).slice(0, 200),
                url: candidate.url,
                version: candidate.version,
                requestedByYourOrganization: true,
            },
        ];
    });
    return [
        ...ranked.filter((item) => item.requestedByYourOrganization),
        ...fallback,
        ...ranked.filter((item) => !item.requestedByYourOrganization),
    ].slice(0, 5);
};
