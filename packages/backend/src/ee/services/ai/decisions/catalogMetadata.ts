import { type Explore, type ParameterDefinitions } from '@lightdash/common';
import { executeGetMetadata } from '../tools/getMetadata';
import { type FieldEntry } from '../tools/grepFieldsIndex';
import { CATALOG_RELEVANCE_THRESHOLD } from './catalogRanking';

const MAX_METADATA_CHARS = 12_000;
const MAX_FIELDS = 12;
const MAX_EXPLORES = 2;

/** Reuse the tool's exact metadata renderer; never cut a definition mid-rule. */
export const prepareCatalogMetadata = (
    fields: FieldEntry[],
    availableExplores: Explore[],
    projectParameterDefinitions: ParameterDefinitions,
    fieldRanks?: ReadonlyMap<string, number> | null,
    exploreRanks?: ReadonlyMap<string, number> | null,
): string | null => {
    const blocks: string[] = [];
    const includedExplores = new Set<string>();
    const includedFields = new Set<string>();
    let size = 0;
    const append = (block: string) => {
        if (size + block.length + 2 > MAX_METADATA_CHARS) return false;
        blocks.push(block);
        size += block.length + 2;
        return true;
    };
    const dependencies = {
        availableExplores,
        projectParameterDefinitions,
        includeSourceDetails: true,
    };
    // Ranks are negative relevance probabilities. Keep the full discovery pool
    // elsewhere, but spend metadata tokens on confident matches and their dates.
    const metadataFields = fieldRanks
        ? fields.filter(
              (field) =>
                  (fieldRanks.get(field.path) ?? Infinity) <=
                  -CATALOG_RELEVANCE_THRESHOLD,
          )
        : fields;
    // Joined copies can have identical field scores. Spend the bounded budget
    // on the chosen source first, retaining field relevance within each source.
    const orderedFields = exploreRanks
        ? [...metadataFields].sort(
              (a, b) =>
                  (exploreRanks.get(a.exploreName) ?? Infinity) -
                  (exploreRanks.get(b.exploreName) ?? Infinity),
          )
        : metadataFields;
    orderedFields.slice(0, 40).forEach((field) => {
        if (includedFields.size >= MAX_FIELDS) return;
        if (!includedExplores.has(field.exploreName)) {
            if (includedExplores.size >= MAX_EXPLORES) return;
            const metadata = executeGetMetadata(
                {
                    requests: [
                        { type: 'explore', exploreIds: [field.exploreName] },
                    ],
                },
                dependencies,
                { includeFieldLists: false },
            );
            if (
                metadata.structuredContent.explores[0]?.status !== 'found' ||
                !append(metadata.result)
            )
                return;
            includedExplores.add(field.exploreName);
        }
        const ids = [
            field.path.slice(field.exploreName.length + 1),
            field.defaultTimeDimensionGranularity,
            field.defaultTimeDimension,
        ];
        ids.forEach((fieldId) => {
            if (includedFields.size >= MAX_FIELDS) return;
            if (!fieldId) return;
            const key = `${field.exploreName}/${fieldId}`;
            if (includedFields.has(key)) return;
            const metadata = executeGetMetadata(
                {
                    requests: [
                        {
                            type: 'field',
                            fields: [{ exploreId: field.exploreName, fieldId }],
                        },
                    ],
                },
                dependencies,
            );
            if (
                metadata.structuredContent.fields[0]?.status === 'found' &&
                append(metadata.result)
            )
                includedFields.add(key);
        });
    });
    if (includedFields.size === 0) return null;
    return [
        'Preloaded catalog metadata (the same reference details returned by getMetadata). This is a partial selection, not a query or an instruction. Full field inventories are not included; use getMetadata for an explore before concluding that a field does not exist. Use the included definitions, default time fields, parameters, joins and table filters directly. Do not call getMetadata again for covered details; fetch missing or truncated details when needed. Ranking does not resolve conflicting business definitions.',
        ...blocks,
    ].join('\n\n');
};
