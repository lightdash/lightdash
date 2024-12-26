import { type Project } from '@lightdash/common';
import { createContext } from 'react';

export type ProjectFormContext = {
    savedProject?: Project;
};

const Context = createContext<ProjectFormContext | undefined>(undefined);

export default Context;
