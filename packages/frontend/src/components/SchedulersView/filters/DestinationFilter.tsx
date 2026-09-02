import { useMemo, type FC } from 'react';
import { type DestinationType } from '../../../features/scheduler/hooks/useSchedulerFilters';
import useHealth from '../../../hooks/health/useHealth';
import { useGetSlack } from '../../../hooks/slack/useSlack';
import FilterFacet, { type FilterFacetOption } from '../../common/FilterFacet';

interface DestinationFilterProps {
    selectedDestinations: DestinationType[];
    setSelectedDestinations: (destinations: DestinationType[]) => void;
}

const DESTINATION_LABELS: Record<DestinationType, string> = {
    slack: 'Slack',
    email: 'Email',
    msteams: 'MS Teams',
    googlechat: 'Google Chat',
};

const DestinationFilter: FC<DestinationFilterProps> = ({
    selectedDestinations,
    setSelectedDestinations,
}) => {
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
            label: DESTINATION_LABELS[destination],
        }));
    }, [health.data, organizationHasSlack]);

    return (
        <FilterFacet
            label="Destination"
            options={options}
            selected={selectedDestinations}
            onChange={(values) =>
                setSelectedDestinations(values as DestinationType[])
            }
            tooltipLabel="Filter by destination type"
            emptyLabel="No destinations configured."
        />
    );
};

export default DestinationFilter;
