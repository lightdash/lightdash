import { createContext } from 'react';
import { type LauncherDockItem } from '../../store/aiAgentLauncherSlice';

export type DocksByProject = Record<string, LauncherDockItem[]>;

export type LauncherDockContextValue = {
    docksByProject: DocksByProject;
    addItem: (projectUuid: string, item: LauncherDockItem) => void;
    removeItem: (projectUuid: string, threadId: string) => void;
};

export const LauncherDockContext =
    createContext<LauncherDockContextValue | null>(null);
