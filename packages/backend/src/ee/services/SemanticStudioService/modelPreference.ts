import { findPreferredPreset, type ModelCatalogue } from '../ai/models';
import { type ModelTier } from '../ai/models/presets';

const CLAUDE_PROVIDERS = ['anthropic', 'bedrock'];
// People wait on each Studio turn, so the quicker model goes first.
const CLAUDE_TIERS: ModelTier[] = ['balanced', 'frontier'];

/**
 * A Studio thread nobody chose a model for runs on Claude where the org is offered it,
 * and otherwise on the strongest model of the provider already in use.
 */
export const findSemanticStudioPreset = (
    catalogue: ModelCatalogue,
    provider: string | null,
) => {
    // The provider in use goes first, so an org on Bedrock stays on Bedrock.
    const claudeProviders = [
        ...CLAUDE_PROVIDERS.filter((name) => name === provider),
        ...CLAUDE_PROVIDERS.filter((name) => name !== provider),
    ];
    const claude = claudeProviders
        .flatMap((name) =>
            CLAUDE_TIERS.map((tier) =>
                findPreferredPreset(catalogue, name, tier),
            ),
        )
        .find((preset) => preset !== null);
    if (claude) return claude;
    return provider
        ? findPreferredPreset(catalogue, provider, 'frontier')
        : null;
};
