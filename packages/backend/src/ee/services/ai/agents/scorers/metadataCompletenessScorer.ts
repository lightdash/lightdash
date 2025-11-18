import {
    MetadataCompletenessEvaluation,
    ScorerContext,
} from '@lightdash/common';
import { type LanguageModel } from 'ai';

/**
 * Analyzes metadata completeness across explores and fields
 * TODO: Implement - ZAP-122
 */
export async function evaluateMetadataCompleteness(
    model: LanguageModel,
    context: ScorerContext,
): Promise<MetadataCompletenessEvaluation> {
    return {
        score: 3,
        recommendations: [
            'Add descriptions to fields',
            'Add AI hints to explores',
        ],
    };
}
