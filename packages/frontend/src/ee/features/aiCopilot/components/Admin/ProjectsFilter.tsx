import { IconBox } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../../components/common/FilterFacet';
import { useProjects } from '../../../../../hooks/useProjects';
import { useAiAgentAdminAgents } from '../../hooks/useAiAgentAdmin';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';

type ProjectsFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'selectedProjectUuids' | 'setSelectedProjectUuids'
> & {
    tooltipLabel?: string;
};

const ProjectsFilter: FC<ProjectsFilterProps> = ({
    selectedProjectUuids,
    setSelectedProjectUuids,
    tooltipLabel = 'Filter threads by project',
}) => {
    const { data: projects, isLoading } = useProjects();
    const organizationAiAgents = useAiAgentAdminAgents();

    const options = useMemo<FilterFacetOption[]>(() => {
        if (!projects || !organizationAiAgents.data) return [];

        const projectUuidsWithAgents = new Set(
            organizationAiAgents.data.map((agent) => agent.projectUuid),
        );

        return projects
            .filter((project) =>
                projectUuidsWithAgents.has(project.projectUuid),
            )
            .map((project) => ({
                value: project.projectUuid,
                label: project.name,
            }));
    }, [projects, organizationAiAgents.data]);

    return (
        <FilterFacet
            label="Project"
            icon={IconBox}
            options={options}
            selected={selectedProjectUuids}
            onChange={setSelectedProjectUuids}
            tooltipLabel={tooltipLabel}
            emptyLabel="No projects with agents available."
            loading={isLoading || organizationAiAgents.isLoading}
            helperText="Showing projects with agents only"
        />
    );
};

export default ProjectsFilter;
