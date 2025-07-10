import { type LanguageMap, type SavedChart } from '@lightdash/common';
import { get } from 'lodash';
import { useState, type FC } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';
import EmbedProviderContext from './context';
import { EMBED_KEY } from './types';

export type LocalStorageEmbed = {
    projectUuid?: string;
    token?: string;
};

type Props = {
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
    contentOverrides?: LanguageMap;
    embedHeaders?: Record<string, string>;
    onExplore?: (options: { chart: SavedChart }) => void;
};

const EmbedProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    embedToken = window.location.hash.replace('#', ''),
    filters,
    projectUuid,
    contentOverrides,
    onExplore,
}) => {
    const t = (input: string) => get(contentOverrides, input);
    const [isInitialized, setIsInitialized] = useState(false);
    const [embed, setEmbed] = useLocalStorageState<LocalStorageEmbed>(
        EMBED_KEY,
        {
            defaultValue: {
                projectUuid,
                token: embedToken,
            },
        },
    );

    // There is method to this madness:
    // When we get an embedded URL, the JWT token is added as a hash to the URL location.
    // We immediately redirect somewhere else to a URL without the hash. Consequently, if we make
    // this initialization in a useEffect, we will not have the hash token in the URL by the time
    // the effect runs.
    if (!isInitialized) {
        setEmbed({ projectUuid, token: embedToken });
        setIsInitialized(true);
    }

    return (
        <EmbedProviderContext.Provider
            value={{
                embedToken: embed?.token || embedToken,
                filters,
                projectUuid: embed?.projectUuid || projectUuid,
                t,
                languageMap: contentOverrides,
                onExplore,
            }}
        >
            {children}
        </EmbedProviderContext.Provider>
    );
};

export default EmbedProvider;
