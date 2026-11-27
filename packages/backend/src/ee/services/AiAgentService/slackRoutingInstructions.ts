export type SlackRoutingProject = {
    projectName: string;
    agentNames: string[];
    instruction: string | null;
};

/**
 * Admin routing rules for a Slack agent pick. One project passes its rules
 * through unchanged, matching the web router; several are scoped per project.
 */
export const buildSlackRoutingInstructions = (
    projects: SlackRoutingProject[],
): string | null => {
    const withRules = projects.filter(
        (project) => (project.instruction ?? '').trim().length > 0,
    );
    if (withRules.length === 0) return null;
    if (projects.length === 1) return withRules[0].instruction;

    return withRules
        .map(
            (project) =>
                `Rules for project "${project.projectName}". They apply only when choosing between its agents (${project.agentNames.join(', ')}):\n${project.instruction}`,
        )
        .join('\n\n');
};
