import { useHotkeys, useLocalStorage } from '@mantine/hooks';

const APP_SIDEBAR_COLLAPSED_STORAGE_KEY = 'app-sidebar:collapsed';
const APP_SIDEBAR_TOGGLE_HOTKEY = 'mod+B';

type AppSidebarCollapse = {
    isCollapsed: boolean;
    setIsCollapsed: (collapsed: boolean) => void;
};

export const useAppSidebarCollapse = (): AppSidebarCollapse => {
    const [isCollapsed, setIsCollapsed] = useLocalStorage<boolean>({
        key: APP_SIDEBAR_COLLAPSED_STORAGE_KEY,
        defaultValue: false,
        getInitialValueInEffect: false,
    });

    useHotkeys([
        [
            APP_SIDEBAR_TOGGLE_HOTKEY,
            () => setIsCollapsed((collapsed) => !collapsed),
        ],
    ]);

    return { isCollapsed, setIsCollapsed };
};
