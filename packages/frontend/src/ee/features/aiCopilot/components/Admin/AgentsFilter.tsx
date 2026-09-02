import { Group, Text } from '@mantine/core';
import { IconRobotFace } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import FilterFacet, {
    type FilterFacetGroup,
} from '../../../../../components/common/FilterFacet';
import { useProjects } from '../../../../../hooks/useProjects';
import { useAiAgentAdminAgents } from '../../hooks/useAiAgentAdmin';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';
import { buildAgentFilterGroups } from './projectFilterOrdering';

type AgentsFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'selectedAgentUuids' | 'setSelectedAgentUuids' | 'selectedProjectUuids'
> & {
    hidePreviewProjects?: boolean;
};

const AgentsFilter: FC<AgentsFilterProps> = ({
    selectedAgentUuids,
    setSelectedAgentUuids,
    selectedProjectUuids,
    hidePreviewProjects = false,
}) => {
    const [searchValue, setSearchValue] = useState('');
    const organizationAiAgents = useAiAgentAdminAgents();
    const { data: projects } = useProjects();

    const hasSelectedProjects = selectedProjectUuids.length > 0;
    const selectedProjectsSet = useMemo(
        () => new Set(selectedProjectUuids),
        [selectedProjectUuids],
    );

    const groups = useMemo<FilterFacetGroup[]>(() => {
        if (!organizationAiAgents.data || !projects) return [];

        const search = searchValue.trim().toLowerCase();

        return buildAgentFilterGroups({
            agents: organizationAiAgents.data,
            projects,
            hidePreviewProjects,
            selectedProjectUuids,
            selectedAgentUuids,
        }).map(({ projectName, agents }) => ({
            label: projectName,
            options: agents
                .filter(
                    (agent) =>
                        !search || agent.name.toLowerCase().includes(search),
                )
                .map((agent) => ({
                    value: agent.uuid,
                    searchLabel: agent.name,
                    label: (
                        <Group gap="two" wrap="nowrap">
                            <LightdashUserAvatar
                                size={16}
                                name={agent.name}
                                src={agent.imageUrl}
                            />
                            <Text fz="xs" truncate>
                                {agent.name}
                            </Text>
                        </Group>
                    ),
                })),
        }));
    }, [
        organizationAiAgents.data,
        projects,
        hidePreviewProjects,
        selectedProjectUuids,
        selectedAgentUuids,
        searchValue,
    ]);

    const effectiveSelectedAgentUuids = useMemo(() => {
        if (!hasSelectedProjects || !organizationAiAgents.data) {
            return selectedAgentUuids;
        }
        const validAgentUuids = new Set(
            organizationAiAgents.data
                .filter((agent) => selectedProjectsSet.has(agent.projectUuid))
                .map((agent) => agent.uuid),
        );
        return selectedAgentUuids.filter((uuid) => validAgentUuids.has(uuid));
    }, [
        hasSelectedProjects,
        organizationAiAgents.data,
        selectedProjectsSet,
        selectedAgentUuids,
    ]);

    return (
        <FilterFacet
            label="Agent"
            icon={IconRobotFace}
            groups={groups}
            selected={effectiveSelectedAgentUuids}
            onChange={setSelectedAgentUuids}
            tooltipLabel={
                hasSelectedProjects
                    ? 'Filter threads by AI agent (filtered by selected projects)'
                    : 'Filter threads by AI agent'
            }
            emptyLabel={
                searchValue
                    ? 'No agents match your search.'
                    : 'No agents available.'
            }
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="Search agents..."
            helperText={
                hasSelectedProjects
                    ? 'Showing agents from selected projects only'
                    : undefined
            }
            loading={organizationAiAgents.isLoading}
        />
    );
};

export default AgentsFilter;
