import { useLocalStorage } from '@mantine/hooks';
import { useCallback, useMemo, useRef } from 'react';
import {
    parseLauncherPanelSize,
    type LauncherPanelSize,
} from './launcherPanelSize';
import { type LauncherPanelSizeContextValue } from './LauncherPanelSizeContext';

const STORAGE_KEY = 'aiAgentsLauncherPanelSize:v1';

type LauncherPanelVars = Record<
    '--ai-launcher-panel-width' | '--ai-launcher-panel-height',
    string
>;

const toVars = (size: LauncherPanelSize): LauncherPanelVars => ({
    '--ai-launcher-panel-width': `${size.width}px`,
    '--ai-launcher-panel-height': `${size.height}px`,
});

export const useLauncherPanelSize = () => {
    const rootRef = useRef<HTMLDivElement>(null);
    const [storedSize, setStoredSize] =
        useLocalStorage<LauncherPanelSize | null>({
            key: STORAGE_KEY,
            defaultValue: null,
            getInitialValueInEffect: false,
            deserialize: parseLauncherPanelSize,
        });

    // Drag updates go straight to the DOM so the chat below is not re-rendered
    // on every pointer move; the final size is committed through React.
    const previewSize = useCallback((size: LauncherPanelSize) => {
        const root = rootRef.current;
        if (!root) return;
        Object.entries(toVars(size)).forEach(([name, value]) =>
            root.style.setProperty(name, value),
        );
    }, []);

    const commitSize = useCallback(
        (size: LauncherPanelSize | null) => setStoredSize(size),
        [setStoredSize],
    );

    const context = useMemo<LauncherPanelSizeContextValue>(
        () => ({ previewSize, commitSize }),
        [previewSize, commitSize],
    );

    const rootVars = useMemo(
        () => (storedSize ? toVars(storedSize) : undefined),
        [storedSize],
    );

    return { rootRef, rootVars, context };
};
