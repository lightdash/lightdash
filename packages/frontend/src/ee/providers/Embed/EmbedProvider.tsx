import { type LanguageMap } from '@lightdash/common';
import { get } from 'lodash';
import { type FC } from 'react';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';
import EmbedProviderContext from './context';

type Props = {
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
    contentOverrides?: LanguageMap;
    onExplore?: (options: { exploreId: string }) => void;
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

    return (
        <EmbedProviderContext.Provider
            value={{
                embedToken,
                filters,
                projectUuid,
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
