import { createContext } from 'react';
import { sharedLightdashApi, type LightdashApi } from '../../api';

// The main app and iframe embeds use the shared token; each SDK component
// provides a client bound to its own token.
export const LightdashApiContext =
    createContext<LightdashApi>(sharedLightdashApi);
