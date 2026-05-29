import { Group, Text } from '@mantine-8/core';
import { IconRobotFace } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import FilterFacet, {
    type FilterFacetGroup,
} from '../../../../../components/common/FilterFacet';
import { useProjects } from '../../../../../hooks/useProjects';
import { useAiAgentAdminAgents } from '../../hooks/useAiAgentAdmin';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';

type AgentsFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'selectedAgentUuids' | 'setSelectedAgentUuids' | 'selectedProjectUuids'
>;

const AgentsFilter: FC<AgentsFilterProps> = ({
    selectedAgentUuids,
    setSelectedAgentUuids,
    selectedProjectUuids,
}) => {
    const organizationAiAgents = useAiAgentAdminAgents();
    const { data: projects } = useProjects();

    const hasSelectedProjects = selectedProjectUuids.length > 0;
    const selectedProjectsSet = useMemo(
        () => new Set(selectedProjectUuids),
        [selectedProjectUuids],
    );

    const groups = useMemo<FilterFacetGroup[]>(() => {
        if (!organizationAiAgents.data || !projects) return [];

        const projectByUuid = new Map(
            projects.map((project) => [project.projectUuid, project]),
        );

        const groupedByProject = new Map<
            string,
            { projectName: string; agents: typeof organizationAiAgents.data }
        >();

        for (const agent of organizationAiAgents.data) {
            const project = projectByUuid.get(agent.projectUuid);
            if (!project) continue;

            const existing = groupedByProject.get(agent.projectUuid);
            if (existing) {
                existing.agents.push(agent);
            } else {
                groupedByProject.set(agent.projectUuid, {
                    projectName: project.name,
                    agents: [agent],
                });
            }
        }

        return Array.from(groupedByProject.entries()).map(
            ([projectUuid, { projectName, agents }]) => ({
                label: projectName,
                options: agents.map((agent) => {
                    const disabled =
                        hasSelectedProjects &&
                        !selectedProjectsSet.has(projectUuid);
                    return {
                        value: agent.uuid,
                        searchLabel: agent.name,
                        disabled,
                        label: (
                            <Group gap="two" wrap="nowrap">
                                <LightdashUserAvatar
                                    size={16}
                                    name={agent.name}
                                    src={agent.imageUrl}
                                />
                                <Text
                                    fz="xs"
                                    c={disabled ? 'ldGray.5' : 'ldGray.9'}
                                    truncate
                                >
                                    {agent.name}
                                </Text>
                            </Group>
                        ),
                    };
                }),
            }),
        );
    }, [
        organizationAiAgents.data,
        projects,
        hasSelectedProjects,
        selectedProjectsSet,
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
            emptyLabel="No agents available."
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
