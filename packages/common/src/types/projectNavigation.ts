// Which conditional navbar items the current user sees in a project.
export type ProjectNavigation = {
    metrics: boolean;
    askAi: boolean;
    autopilot: boolean;
    learn: boolean;
};

export type ApiProjectNavigationResponse = {
    status: 'ok';
    results: ProjectNavigation;
};
