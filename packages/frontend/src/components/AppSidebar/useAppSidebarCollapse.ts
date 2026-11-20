import { useHotkeys, useLocalStorage } from '@mantine/hooks';
import { useCallback, useState } from 'react';

const APP_SIDEBAR_COLLAPSED_STORAGE_KEY = 'app-sidebar:collapsed';
const APP_SIDEBAR_TOGGLE_HOTKEY = 'mod+B';

type AppSidebarCollapse = {
    isCollapsed: boolean;
    /** False after a keyboard toggle, which must stay instant. */
    isAnimated: boolean;
    toggleWithPointer: () => void;
    setCollapsedInstantly: (collapsed: boolean) => void;
};

export const useAppSidebarCollapse = (): AppSidebarCollapse => {
    const [isCollapsed, setIsCollapsed] = useLocalStorage<boolean>({
        key: APP_SIDEBAR_COLLAPSED_STORAGE_KEY,
        defaultValue: false,
        getInitialValueInEffect: false,
    });

    const [isAnimated, setIsAnimated] = useState(false);

    const toggle = useCallback(
        (animated: boolean) => {
            setIsAnimated(animated);
            setIsCollapsed((collapsed) => !collapsed);
        },
        [setIsCollapsed],
    );
    const toggleWithPointer = useCallback(() => toggle(true), [toggle]);

    const setCollapsedInstantly = useCallback(
        (collapsed: boolean) => {
            setIsAnimated(false);
            setIsCollapsed(collapsed);
        },
        [setIsCollapsed],
    );

    useHotkeys([[APP_SIDEBAR_TOGGLE_HOTKEY, () => toggle(false)]]);

    return {
        isCollapsed,
        isAnimated,
        toggleWithPointer,
        setCollapsedInstantly,
    };
};
