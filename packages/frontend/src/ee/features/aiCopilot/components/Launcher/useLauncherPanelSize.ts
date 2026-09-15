import { useLocalStorage } from '@mantine/hooks';
import { useCallback, useMemo, useRef } from 'react';
import {
    parseLauncherPanelSize,
    type LauncherPanelSize,
} from './launcherPanelSize';
import { type LauncherPanelSizeContextValue } from './LauncherPanelSizeContext';

const SIZE_STORAGE_KEY = 'aiAgentsLauncherPanelSize:v1';
const HINT_STORAGE_KEY = 'aiAgentsLauncherPanelResizeHintSeen:v1';

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
            key: SIZE_STORAGE_KEY,
            defaultValue: null,
            getInitialValueInEffect: false,
            deserialize: parseLauncherPanelSize,
        });
    const [resizeHintSeen, setResizeHintSeen] = useLocalStorage<boolean>({
        key: HINT_STORAGE_KEY,
        defaultValue: false,
        getInitialValueInEffect: false,
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

    const markResizeHintSeen = useCallback(
        () => setResizeHintSeen(true),
        [setResizeHintSeen],
    );

    const commitSize = useCallback(
        (size: LauncherPanelSize | null) => {
            setStoredSize(size);
            if (size) setResizeHintSeen(true);
        },
        [setStoredSize, setResizeHintSeen],
    );

    const context = useMemo<LauncherPanelSizeContextValue>(
        () => ({ previewSize, commitSize, resizeHintSeen, markResizeHintSeen }),
        [previewSize, commitSize, resizeHintSeen, markResizeHintSeen],
    );

    const rootVars = useMemo(
        () => (storedSize ? toVars(storedSize) : undefined),
        [storedSize],
    );

    return { rootRef, rootVars, context };
};
