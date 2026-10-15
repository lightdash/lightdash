import { IconBox } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    tooltipLabel,
    projectScope = 'with-agents',
    hidePreviewProjects = false,
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
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
            label={t('filters.projects.label')}
            icon={IconBox}
            options={filteredOptions}
            selected={selectedProjectUuids}
            onChange={setSelectedProjectUuids}
            tooltipLabel={tooltipLabel ?? t('filters.projects.defaultTooltip')}
            emptyLabel={
                searchValue
                    ? t('filters.projects.noMatch')
                    : t('filters.projects.empty')
            }
            loading={
                isLoading ||
                (projectScope === 'with-agents' &&
                    organizationAiAgents.isLoading)
            }
            helperText={
                projectScope === 'with-agents'
                    ? t('filters.projects.withAgentsOnly')
                    : undefined
            }
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder={t('filters.projects.searchPlaceholder')}
        />
    );
};

export default ProjectsFilter;
