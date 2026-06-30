import { type Project } from '@lightdash/common';
import { createContext } from 'react';

export type ProjectFormContext = {
    savedProject?: Project;
    // True when the dbt form is rendering for an additional dbt source (not the
    // project's primary connection): restricts providers to git and hides
    // fields inherited from the project (dbt version, warehouse schema).
    isDbtSource?: boolean;
};

const Context = createContext<ProjectFormContext | undefined>(undefined);

export default Context;
