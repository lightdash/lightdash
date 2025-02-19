import { get } from 'lodash';
import { type FC } from 'react';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';
import EmbedProviderContext from './context';
import { type NestedLanguage } from './types';

type Props = {
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
    contentOverrides?: NestedLanguage;
};

const EmbedProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    embedToken = window.location.hash.replace('#', ''),
    filters,
    projectUuid,
    contentOverrides,
}) => {
    
    const t = (input: string) => {
        return get(contentOverrides, input);
    };

    return (
        <EmbedProviderContext.Provider
            value={{ embedToken, filters, projectUuid, t }}
        >
            {children}
        </EmbedProviderContext.Provider>
    );
};

export default EmbedProvider;
