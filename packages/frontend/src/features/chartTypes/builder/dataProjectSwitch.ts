import { type OrganizationProject } from '@lightdash/common';
import { createContext, useContext } from 'react';

/**
 * The project an organization chart type previews real data from, and how to
 * move the builder to another one. Absent in the project builder, whose data
 * always comes from its own project.
 */
export type DataProjectSwitch = {
    projectUuid: string;
    onChange: (
        project: Pick<OrganizationProject, 'projectUuid' | 'slug'>,
    ) => void;
};

export const DataProjectSwitchContext = createContext<DataProjectSwitch | null>(
    null,
);

export const useDataProjectSwitch = () => useContext(DataProjectSwitchContext);
