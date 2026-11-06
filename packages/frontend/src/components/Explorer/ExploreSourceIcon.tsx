import {
    ExploreType,
    type ApiConnectorType,
    type SummaryExplore,
} from '@lightdash/common';
import { IconTable } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useExternalConnections } from '../../features/externalConnections/hooks/useExternalConnections';
import {
    createLiveSourceMatcher,
    integrationOfLiveExploreName,
} from '../../features/externalConnections/liveSources/liveSourceExplores';
import { canListLiveSources } from '../../features/semanticStudio/permissions';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useApp from '../../providers/App/useApp';
import { DataSourceIcon } from '../common/DataSourceIcon';
import { exploreSourceIconOf } from '../common/dataSourceIconOf';
import MantineIcon from '../common/MantineIcon';

/**
 * The integration a live explore reads: its source's, for people who can list
 * the live data sources, otherwise guessed from the explore's name.
 */
const useLiveExploreIntegration = (
    explore: SummaryExplore,
): ApiConnectorType | undefined => {
    const { user } = useApp();
    const projectUuid = useProjectUuid();
    const isLive = explore.type === ExploreType.API_SOURCE;
    const ability = user.data?.ability;
    const organizationUuid = user.data?.organizationUuid;
    const canList =
        isLive &&
        !!ability &&
        !!organizationUuid &&
        !!projectUuid &&
        canListLiveSources(ability, organizationUuid, projectUuid);
    // Only for the logo, so a failed or stale list never refetches per row.
    const { data: connections } = useExternalConnections(
        canList ? projectUuid : undefined,
        { retry: false, refetchOnWindowFocus: false },
    );
    return useMemo(() => {
        if (!isLive) return undefined;
        const connection = connections
            ? createLiveSourceMatcher(connections)(explore.name)
            : undefined;
        return (
            connection?.apiSource?.connector ??
            integrationOfLiveExploreName(explore.name)
        );
    }, [isLive, connections, explore.name]);
};

/**
 * An explore's icon on the Explore page: the integration's logo for a live
 * data source, the CSV or Google Sheets icon for an external source, and a
 * table for a warehouse explore. Matches the Semantic Layer page.
 */
export const ExploreSourceIcon: FC<{ explore: SummaryExplore }> = ({
    explore,
}) => {
    const liveIntegration = useLiveExploreIntegration(explore);
    const source = exploreSourceIconOf(explore, liveIntegration);
    return source ? (
        <DataSourceIcon source={source} size={16} color="ldGray.7" />
    ) : (
        <MantineIcon icon={IconTable} size={16} color="ldGray.7" stroke={1.5} />
    );
};
