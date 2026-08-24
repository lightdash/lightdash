import { ProjectType } from '@lightdash/common';

export type FilterProject = {
    projectUuid: string;
    name: string;
    type: ProjectType;
};

export type AgentFilterGroup<TAgent> = {
    projectUuid: string;
    projectName: string;
    agents: TAgent[];
};

type AgentLike = {
    uuid: string;
    name: string;
    projectUuid: string;
};

const projectTier = (type: ProjectType): number =>
    type === ProjectType.PREVIEW ? 1 : 0;

const byNameCaseInsensitive = (a: string, b: string): number =>
    a.localeCompare(b, undefined, { sensitivity: 'base' });

const compareProjectsForDisplay = (
    a: Pick<FilterProject, 'name' | 'type'>,
    b: Pick<FilterProject, 'name' | 'type'>,
): number =>
    projectTier(a.type) - projectTier(b.type) ||
    byNameCaseInsensitive(a.name, b.name);

// Selected previews stay visible so shared links and existing selections
// never point at options the user can no longer see or unselect.
const isProjectVisible = (
    project: Pick<FilterProject, 'projectUuid' | 'type'>,
    hidePreviewProjects: boolean,
    selectedProjectUuids: Set<string>,
): boolean =>
    !hidePreviewProjects ||
    project.type !== ProjectType.PREVIEW ||
    selectedProjectUuids.has(project.projectUuid);

export const sortAndFilterVisibleProjects = <T extends FilterProject>(args: {
    projects: T[];
    hidePreviewProjects: boolean;
    selectedProjectUuids: string[];
}): T[] => {
    const selected = new Set(args.selectedProjectUuids);
    return args.projects
        .filter((project) =>
            isProjectVisible(project, args.hidePreviewProjects, selected),
        )
        .sort(compareProjectsForDisplay);
};

export const buildAgentFilterGroups = <TAgent extends AgentLike>(args: {
    agents: TAgent[];
    projects: FilterProject[];
    hidePreviewProjects: boolean;
    selectedProjectUuids: string[];
    selectedAgentUuids: string[];
}): AgentFilterGroup<TAgent>[] => {
    const projectByUuid = new Map(
        args.projects.map((project) => [project.projectUuid, project]),
    );
    const selectedProjects = new Set(args.selectedProjectUuids);
    const selectedAgents = new Set(args.selectedAgentUuids);
    const hasSelectedProjects = selectedProjects.size > 0;

    const agentsByProject = args.agents.reduce((acc, agent) => {
        if (!projectByUuid.has(agent.projectUuid)) return acc;
        const existing = acc.get(agent.projectUuid);
        if (existing) {
            existing.push(agent);
        } else {
            acc.set(agent.projectUuid, [agent]);
        }
        return acc;
    }, new Map<string, TAgent[]>());

    return Array.from(agentsByProject.entries())
        .map(([projectUuid, agents]) => ({
            project: projectByUuid.get(projectUuid)!,
            agents,
        }))
        .filter(({ project, agents }) =>
            hasSelectedProjects
                ? selectedProjects.has(project.projectUuid)
                : isProjectVisible(
                      project,
                      args.hidePreviewProjects,
                      selectedProjects,
                  ) || agents.some((agent) => selectedAgents.has(agent.uuid)),
        )
        .sort((a, b) => compareProjectsForDisplay(a.project, b.project))
        .map(({ project, agents }) => ({
            projectUuid: project.projectUuid,
            projectName: project.name,
            agents: [...agents].sort((a, b) =>
                byNameCaseInsensitive(a.name, b.name),
            ),
        }));
};
