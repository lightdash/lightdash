import { type ReleaseHighlight } from '@lightdash/common';
import { type CachedReleaseHighlights } from '../../models/ReleaseHighlightsModel';

export const buildHighlights = (
    cached: CachedReleaseHighlights,
    matchedNumbers: Set<number>,
): ReleaseHighlight[] => {
    const candidates = new Map(
        cached.candidates.map((item) => [item.id, item]),
    );
    const seen = new Set<string>();
    const highlights = cached.ranked.flatMap((ranked) => {
        const candidate = candidates.get(ranked.candidateId);
        if (!candidate || seen.has(ranked.candidateId)) return [];
        seen.add(ranked.candidateId);
        return [
            {
                title: ranked.title,
                benefit: ranked.benefit,
                url: candidate.url,
                version: candidate.version,
                requestedByYourOrganization:
                    candidate.number !== null &&
                    matchedNumbers.has(candidate.number),
            },
        ];
    });
    return [
        ...highlights.filter((item) => item.requestedByYourOrganization),
        ...highlights.filter((item) => !item.requestedByYourOrganization),
    ].slice(0, 5);
};
