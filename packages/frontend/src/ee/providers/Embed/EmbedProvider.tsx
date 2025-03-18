import { type LanguageMap } from '@lightdash/common';
import { get } from 'lodash';
import { useEffect, useState, type FC } from 'react';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';
import EmbedProviderContext from './context';

type Props = {
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
    contentOverrides?: LanguageMap;
};

const EmbedProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    embedToken: embedTokenProp,
    filters,
    projectUuid,
    contentOverrides,
}) => {
    const t = (input: string) => get(contentOverrides, input);

    const [isInitialized, setIsInitialized] = useState(false);
    const [embedToken, setEmbedToken] = useState<string>();

    useEffect(() => {
        setEmbedToken(embedTokenProp ?? window.location.hash.replace('#', ''));
        setIsInitialized(true);
    }, [embedTokenProp]);

    if (!isInitialized) return null;

    return (
        <EmbedProviderContext.Provider
            value={{
                embedToken,
                filters,
                projectUuid,
                t,
                languageMap: contentOverrides,
            }}
        >
            {children}
        </EmbedProviderContext.Provider>
    );
};

export default EmbedProvider;
