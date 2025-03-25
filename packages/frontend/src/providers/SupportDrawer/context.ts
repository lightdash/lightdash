import { createContext } from 'react';

export interface SupportDrawerContextType {
    openSupportDrawer: () => void;
    closeSupportDrawer: () => void;
}

const SupportDrawerContext = createContext<SupportDrawerContextType | null>(
    null,
);

export default SupportDrawerContext;
