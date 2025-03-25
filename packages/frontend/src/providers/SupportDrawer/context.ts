import { createContext } from 'react';

export interface DrawerContextType {
    openDrawer: (content: React.ReactNode, title?: string) => void;
    closeDrawer: () => void;
}

const DrawerContext = createContext<DrawerContextType | null>(null);

export default DrawerContext;
