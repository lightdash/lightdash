import { CatalogField, CatalogTable, CatalogType } from '@lightdash/common';

/**
 * Checks if explore selection is ambiguous based on search results.
 * Uses field search results to boost explore relevance scores.
 * Returns candidates if multiple explores have similar relevance scores after boosting.
 */
export function checkExploreAmbiguity(
    searchResults: Array<CatalogTable>,
    selectedExploreName: string,
    fieldSearchResults?: Array<CatalogField>,
): {
    isAmbiguous: boolean;
    candidates: Array<
        Pick<
            CatalogTable,
            'name' | 'label' | 'aiHints' | 'description' | 'searchRank'
        > & {
            matchingFields?: Array<
                Pick<CatalogField, 'name' | 'label' | 'searchRank'>
            >;
        }
    >;
} {
    // No ambiguity if less than 2 results
    if (searchResults.length < 2) {
        return { isAmbiguous: false, candidates: [] };
    }

    const topResult = searchResults[0];
    if (!topResult.searchRank) {
        return { isAmbiguous: false, candidates: [] };
    }

    // Group fields by explore name for boosting
    const fieldsByExplore = new Map<
        string,
        Array<{ name: string; label: string; searchRank: number }>
    >();

    if (fieldSearchResults) {
        fieldSearchResults.forEach((field) => {
            if (field.type === CatalogType.Field && field.searchRank) {
                const exploreName = field.tableName || field.name;
                if (!fieldsByExplore.has(exploreName)) {
                    fieldsByExplore.set(exploreName, []);
                }
                fieldsByExplore.get(exploreName)!.push({
                    name: field.name,
                    label: field.label,
                    searchRank: field.searchRank,
                });
            }
        });
    }

    const minRelevanceThreshold = 0.1; // Only consider results above this
    const similarityThreshold = 0.25; // Rank difference threshold for ambiguity
    const fieldBoostWeight = 0.4; // Weight of field matches (40%)

    // Filter and boost candidates based on field matches
    const boostedResults = searchResults
        .filter(
            (result) =>
                result.searchRank && result.searchRank >= minRelevanceThreshold,
        )
        .map((result) => {
            const matchingFields = fieldsByExplore.get(result.name) || [];

            // Find the highest-scoring field within this explore
            // This represents the best field match for the user's query
            const topFieldRank =
                matchingFields.length > 0
                    ? Math.max(...matchingFields.map((f) => f.searchRank))
                    : 0;

            // Boost explore rank by adding weighted field score
            // Example: If explore has 0.7 rank and best field has 0.8 rank with 40% weight:
            //   boostedRank = 0.7 + (0.8 * 0.4) = 1.02
            // This helps surface explores with highly relevant fields, even if the
            // explore name/description itself is less relevant
            const boostedRank =
                result.searchRank! + topFieldRank * fieldBoostWeight;

            return {
                name: result.name,
                label: result.label,
                aiHints: result.aiHints,
                description: result.description,
                searchRank: boostedRank,
                matchingFields: matchingFields
                    .sort((a, b) => b.searchRank - a.searchRank)
                    .slice(0, 3), // Top 3 matching fields
            };
        })
        .sort((a, b) => b.searchRank - a.searchRank); // Re-sort after boosting

    // Filter based on the NEW top result after boosting
    const newTopResult = boostedResults[0];
    const candidates = boostedResults.filter(
        (result) =>
            newTopResult &&
            Math.abs(result.searchRank - newTopResult.searchRank) <=
                similarityThreshold,
    );

    // Ambiguous if:
    // 1. Multiple similar candidates exist (2+)
    // 2. The selected explore is NOT the top result (after boosting)
    const selectedIsTopResult =
        candidates.length > 0 && candidates[0].name === selectedExploreName;

    const hasMultipleSimilarResults = candidates.length >= 2;

    const isAmbiguous = hasMultipleSimilarResults && !selectedIsTopResult;

    return {
        isAmbiguous,
        candidates,
    };
}
