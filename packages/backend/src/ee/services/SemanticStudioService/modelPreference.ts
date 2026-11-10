import { type ModelTier } from '../ai/models/presets';

/** Modelling a semantic layer is a few turns that people then rely on, so a Studio thread prefers a stronger model than the default where one is known for the provider. */
export const SEMANTIC_STUDIO_MODEL_TIERS: Partial<Record<string, ModelTier>> = {
    anthropic: 'frontier',
    bedrock: 'frontier',
    openai: 'balanced',
};
