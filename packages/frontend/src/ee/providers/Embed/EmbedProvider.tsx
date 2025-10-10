import { type LanguageMap, type SavedChart } from '@lightdash/common';
import get from 'lodash/get';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import { useAccount } from '../../../hooks/user/useAccount';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import {
    getFromInMemoryStorage,
    setToInMemoryStorage,
} from '../../../utils/inMemoryStorage';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';
import EmbedProviderContext from './context';
import { EMBED_KEY, type EmbedMode, type InMemoryEmbed } from './types';

type Props = {
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
    contentOverrides?: LanguageMap;
    embedHeaders?: Record<string, string>;
    onExplore?: (options: { chart: SavedChart }) => void;
    onBackToDashboard?: () => void;
    savedChart?: SavedChart;
};

const EmbedProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    embedToken: encodedToken,
    filters,
    projectUuid: projectUuidFromProps,
    contentOverrides,
    onExplore,
    onBackToDashboard,
    savedChart,
}) => {
    const embedToken = encodedToken || window.location.hash.replace('#', '');
    const [isInitialized, setIsInitialized] = useState(false);
    const embed = getFromInMemoryStorage<InMemoryEmbed>(EMBED_KEY);
    const { data: account, isLoading } = useAccount();
    const ability = useAbilityContext();
    const params = useParams();
    const projectUuid = projectUuidFromProps || params.projectUuid;

    // Set ability rules for the embedded user. We should only get abilities from abilityContext
    // rather than directly on the user or account.
    useEffect(() => {
        if (!isLoading && account?.user) {
            ability.update(account.user.abilityRules);
        }
    }, [ability, account, isLoading]);

    // There is method to this madness:
    // When we get an embedded URL, the JWT token is added as a hash to the URL location.
    // We immediately redirect somewhere else to a URL without the hash. Consequently, if we make
    // this initialization in a useEffect, we will not have the hash token in the URL by the time
    // the effect runs.
    if (!isInitialized) {
        setToInMemoryStorage(EMBED_KEY, {
            projectUuid,
            token: embedToken,
        });
        setIsInitialized(true);
    }

    const value = useMemo(() => {
        return {
            embedToken: embed?.token || embedToken,
            filters,
            t: (input: string) => get(contentOverrides, input),
            projectUuid: embed?.projectUuid || projectUuid,
            languageMap: contentOverrides,
            onExplore,
            savedChart,
            onBackToDashboard,
            mode: (encodedToken ? 'sdk' : 'direct') as EmbedMode,
        };
    }, [
        embed?.projectUuid,
        embed?.token,
        embedToken,
        filters,
        projectUuid,
        contentOverrides,
        onExplore,
        savedChart,
        onBackToDashboard,
        encodedToken,
    ]);

    return (
        <EmbedProviderContext.Provider value={value}>
            {children}
        </EmbedProviderContext.Provider>
    );
};

export default EmbedProvider;
