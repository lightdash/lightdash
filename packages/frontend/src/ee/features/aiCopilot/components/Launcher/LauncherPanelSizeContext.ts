import { createContext, useContext } from 'react';
import { type LauncherPanelSize } from './launcherPanelSize';

export type LauncherPanelSizeContextValue = {
    previewSize: (size: LauncherPanelSize) => void;
    commitSize: (size: LauncherPanelSize | null) => void;
};

export const LauncherPanelSizeContext =
    createContext<LauncherPanelSizeContextValue | null>(null);

export const useLauncherPanelSizeContext = () => {
    const ctx = useContext(LauncherPanelSizeContext);
    if (!ctx) {
        throw new Error(
            'useLauncherPanelSizeContext must be used within AiAgentsLauncher',
        );
    }
    return ctx;
};
