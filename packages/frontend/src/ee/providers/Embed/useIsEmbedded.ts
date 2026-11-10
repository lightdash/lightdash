import { useContext } from 'react';
import EmbedProviderContext from './context';

// True when the app is rendered inside an embed (iframe or SDK)
const useIsEmbedded = (): boolean =>
    !!useContext(EmbedProviderContext).embedToken;

export default useIsEmbedded;
