import { IconBox } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
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
    const [searchValue, setSearchValue] = useState('');
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

    const filteredOptions = useMemo<FilterFacetOption[]>(() => {
        const search = searchValue.trim().toLowerCase();
        if (!search) return options;

        return options.filter((option) => {
            const label =
                typeof option.label === 'string'
                    ? option.label
                    : option.searchLabel;
            return label?.toLowerCase().includes(search);
        });
    }, [options, searchValue]);

    return (
        <FilterFacet
            label="Project"
            icon={IconBox}
            options={filteredOptions}
            selected={selectedProjectUuids}
            onChange={setSelectedProjectUuids}
            tooltipLabel={tooltipLabel}
            emptyLabel={
                searchValue
                    ? 'No projects match your search.'
                    : 'No projects with agents available.'
            }
            loading={isLoading || organizationAiAgents.isLoading}
            helperText="Showing projects with agents only"
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="Search projects..."
        />
    );
};

export default ProjectsFilter;
