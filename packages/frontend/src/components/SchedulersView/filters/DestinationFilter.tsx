import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { type DestinationType } from '../../../features/scheduler/hooks/useSchedulerFilters';
import useHealth from '../../../hooks/health/useHealth';
import { useGetSlack } from '../../../hooks/slack/useSlack';
import FilterFacet, { type FilterFacetOption } from '../../common/FilterFacet';

interface DestinationFilterProps {
    selectedDestinations: DestinationType[];
    setSelectedDestinations: (destinations: DestinationType[]) => void;
}

const DESTINATION_LABEL_KEYS: Record<DestinationType, string> = {
    slack: 'destinations.slack',
    email: 'destinations.email',
    msteams: 'destinations.msTeams',
    googlechat: 'destinations.googleChat',
};

const DestinationFilter: FC<DestinationFilterProps> = ({
    selectedDestinations,
    setSelectedDestinations,
}) => {
    const { t } = useTranslation('scheduler');
    const health = useHealth();
    const slack = useGetSlack();
    const organizationHasSlack = !!slack.data?.organizationUuid;

    const options = useMemo<FilterFacetOption[]>(() => {
        const destinations: DestinationType[] = [];
        if (health.data?.hasEmailClient) destinations.push('email');
        if (organizationHasSlack) destinations.push('slack');
        if (health.data?.hasMicrosoftTeams) destinations.push('msteams');
        destinations.push('googlechat');
        return destinations.map((destination) => ({
            value: destination,
            label: t(DESTINATION_LABEL_KEYS[destination]),
        }));
    }, [health.data, organizationHasSlack, t]);

    return (
        <FilterFacet
            label={t('filters.destination.label')}
            options={options}
            selected={selectedDestinations}
            onChange={(values) =>
                setSelectedDestinations(values as DestinationType[])
            }
            tooltipLabel={t('filters.destination.tooltip')}
            emptyLabel={t('filters.destination.empty')}
        />
    );
};

export default DestinationFilter;
