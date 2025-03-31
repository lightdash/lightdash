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
};

const EmbedProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    embedToken = window.location.hash.replace('#', ''),
    filters,
    projectUuid,
    contentOverrides,
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
            }}
        >
            {children}
        </EmbedProviderContext.Provider>
    );
};

export default EmbedProvider;
