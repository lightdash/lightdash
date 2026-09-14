import { IconBox } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../../components/common/FilterFacet';
import { useProjects } from '../../../../../hooks/useProjects';
import { useAiAgentAdminAgents } from '../../hooks/useAiAgentAdmin';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';
import { sortAndFilterVisibleProjects } from './projectFilterOrdering';

type ProjectsFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'selectedProjectUuids' | 'setSelectedProjectUuids'
> & {
    tooltipLabel?: string;
    // 'with-agents' hides projects that have no agent; 'all' lists every
    // project, which audit surfaces need since content outlives its agent
    projectScope?: 'with-agents' | 'all';
    hidePreviewProjects?: boolean;
};

const ProjectsFilter: FC<ProjectsFilterProps> = ({
    selectedProjectUuids,
    setSelectedProjectUuids,
    tooltipLabel = 'Filter threads by project',
    projectScope = 'with-agents',
    hidePreviewProjects = false,
}) => {
    const [searchValue, setSearchValue] = useState('');
    const { data: projects, isLoading } = useProjects();
    const organizationAiAgents = useAiAgentAdminAgents({
        enabled: projectScope === 'with-agents',
    });

    const options = useMemo<FilterFacetOption[]>(() => {
        if (!projects) return [];

        const toOption = (project: { projectUuid: string; name: string }) => ({
            value: project.projectUuid,
            label: project.name,
        });

        const toVisibleSortedOptions = (scopedProjects: typeof projects) =>
            sortAndFilterVisibleProjects({
                projects: scopedProjects,
                hidePreviewProjects,
                selectedProjectUuids,
            }).map(toOption);

        if (projectScope === 'all') {
            return toVisibleSortedOptions(projects);
        }

        if (!organizationAiAgents.data) return [];

        const projectUuidsWithAgents = new Set(
            organizationAiAgents.data.map((agent) => agent.projectUuid),
        );

        return toVisibleSortedOptions(
            projects.filter((project) =>
                projectUuidsWithAgents.has(project.projectUuid),
            ),
        );
    }, [
        projects,
        organizationAiAgents.data,
        projectScope,
        hidePreviewProjects,
        selectedProjectUuids,
    ]);

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
                    : 'No projects available.'
            }
            loading={
                isLoading ||
                (projectScope === 'with-agents' &&
                    organizationAiAgents.isLoading)
            }
            helperText={
                projectScope === 'with-agents'
                    ? 'Showing projects with agents only'
                    : undefined
            }
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="Search projects..."
        />
    );
};

export default ProjectsFilter;
