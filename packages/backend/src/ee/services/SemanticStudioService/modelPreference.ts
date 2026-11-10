import { type ModelTier } from '../ai/models/presets';

/** Modelling a semantic layer is a few turns that people then rely on, so a Studio thread prefers the strongest model its provider offers over the default. */
export const SEMANTIC_STUDIO_MODEL_TIER: ModelTier = 'frontier';
