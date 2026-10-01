import useEmbed from './useEmbed';

// True when the app is rendered inside an embed (iframe or SDK)
const useIsEmbedded = (): boolean => !!useEmbed().embedToken;

export default useIsEmbedded;
