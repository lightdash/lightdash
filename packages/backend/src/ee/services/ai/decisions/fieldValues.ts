import { AiDecisionClient, confidentChoice } from './AiDecisionClient';

const MAX_FIELD_VALUE_OPTIONS = 100;
const MAX_DECISION_TEXT_LENGTH = 512;
const MAX_RAW_DECISION_TEXT_LENGTH = MAX_DECISION_TEXT_LENGTH * 2;

const normalizeDecisionText = (
    value: string | number | boolean,
): string | null => {
    const raw = String(value);
    if (raw.length > MAX_RAW_DECISION_TEXT_LENGTH) return null;

    const normalized = raw
        .normalize('NFKC')
        .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();

    return normalized.length > 0 &&
        normalized.length <= MAX_DECISION_TEXT_LENGTH
        ? normalized
        : null;
};

export const resolveFieldValue = async ({
    decisions,
    fieldId,
    requested,
    values,
}: {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    fieldId: string;
    requested: string;
    values: Array<string | number | boolean>;
}): Promise<string | number | boolean | null> => {
    const unique = [...new Set(values)];
    if (unique.includes(requested)) return requested;
    if (unique.length === 0 || unique.length > MAX_FIELD_VALUE_OPTIONS)
        return null;

    const safeFieldId = normalizeDecisionText(fieldId);
    const safeRequested = normalizeDecisionText(requested);
    if (!safeFieldId || !safeRequested) return null;

    const seen = new Set<string>();
    const candidates: Array<{
        original: string | number | boolean;
        safe: string;
    }> = [];
    for (const original of unique) {
        const safe = normalizeDecisionText(original);
        if (safe) {
            // The provider cannot distinguish values whose normalized labels collide.
            if (seen.has(safe)) return null;
            seen.add(safe);
            candidates.push({ original, safe });
        }
    }
    if (candidates.length === 0) return null;

    const answers = await decisions.evaluate({
        operation: 'filter-value',
        state: {
            fieldId: safeFieldId,
            requested: safeRequested,
            values: candidates.map(({ safe }) => safe),
        },
        questions: {
            value: {
                type: 'choice',
                instructions:
                    'Which existing value unambiguously denotes the same entity or category as the requested value? Abbreviations and equivalent names are allowed. A merely related value, broader category or different entity is not equivalent. Choose none when uncertain.',
                criteria: {
                    ...Object.fromEntries(
                        candidates.map(({ safe }, i) => [String(i), safe]),
                    ),
                    none: 'No unambiguous equivalent',
                },
            },
        },
    });
    const selected = confidentChoice(answers?.value, 0.95);
    return selected === null || selected === 'none'
        ? null
        : (candidates[Number(selected)]?.original ?? null);
};
