import { type FC } from 'react';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';
import EmbedProviderContext from './context';

type Props = {
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
};

const EmbedProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    embedToken = window.location.hash.replace('#', ''),
    filters,
    projectUuid,
}) => {
    return (
        <EmbedProviderContext.Provider
            value={{ embedToken, filters, projectUuid }}
        >
            {children}
        </EmbedProviderContext.Provider>
    );
};

export default EmbedProvider;
