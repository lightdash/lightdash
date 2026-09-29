import useEmbed from '../../../../ee/providers/Embed/useEmbed';

// The SDK bundle ships no Monaco workers, so the deprecated Vega editor is not offered in embeds.
export const useIsVegaEditorAvailable = (): boolean => !useEmbed().embedToken;
