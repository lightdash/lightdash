import { type Project } from '@lightdash/common';
import { createContext, useContext } from 'react';

export type ProjectRouteContextValue = {
    project: Project;
    projectUuid: string;
    projectUrlIdentifier: string;
};

export const ProjectRouteContext =
    createContext<ProjectRouteContextValue | null>(null);

const useProjectRoute = () => {
    const context = useContext(ProjectRouteContext);

    if (!context) {
        throw new Error('useProjectRoute must be used within a ProjectRoute');
    }

    return context;
};

export const useOptionalProjectRoute = () => useContext(ProjectRouteContext);

export const useProjectUrlIdentifier = () =>
    useProjectRoute().projectUrlIdentifier;
