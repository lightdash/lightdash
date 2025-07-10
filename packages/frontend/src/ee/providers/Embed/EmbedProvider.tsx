import {
    JWT_HEADER_NAME,
    type LanguageMap,
    type SavedChart,
} from '@lightdash/common';
import { get } from 'lodash';
import { useMemo, type FC } from 'react';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';
import EmbedProviderContext from './context';

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
    const embedHeaders = useMemo(() => {
        return {
            [JWT_HEADER_NAME]: embedToken,
        };
    }, [embedToken]);

    return (
        <EmbedProviderContext.Provider
            value={{
                embedToken,
                embedHeaders,
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
