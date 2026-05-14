import { useLocalStorage } from '@mantine-8/hooks';
import { useCallback, useMemo, type FC, type PropsWithChildren } from 'react';
import useApp from '../../../../../providers/App/useApp';
import { store as aiAgentStore } from '../../store';
import {
    dockItemRemoved,
    type LauncherDockItem,
} from '../../store/aiAgentLauncherSlice';
import {
    LauncherDockContext,
    type DocksByProject,
} from './LauncherDockContext';

const MAX_DOCK_ITEMS = 6;
// Schema-bump escape hatch: bumping the version invalidates older shapes
// rather than requiring runtime migration.
const STORAGE_KEY_PREFIX = 'aiAgentsLauncherDock:v2';

const trim = (items: LauncherDockItem[]): LauncherDockItem[] =>
    items.length <= MAX_DOCK_ITEMS
        ? items
        : items.slice(items.length - MAX_DOCK_ITEMS);

export const LauncherDockProvider: FC<PropsWithChildren> = ({ children }) => {
    const { user } = useApp();
    const userUuid = user.data?.userUuid;

    const [docksByProject, setDocksByProject] = useLocalStorage<DocksByProject>(
        {
            key: `${STORAGE_KEY_PREFIX}:${userUuid ?? '_'}`,
            defaultValue: {},
        },
    );

    const addItem = useCallback(
        (projectUuid: string, item: LauncherDockItem) => {
            setDocksByProject((prev) => {
                const current = prev?.[projectUuid] ?? [];
                const without = current.filter(
                    (x) => x.threadId !== item.threadId,
                );
                return {
                    ...(prev ?? {}),
                    [projectUuid]: trim([...without, item]),
                };
            });
        },
        [setDocksByProject],
    );

    const removeItem = useCallback(
        (projectUuid: string, threadId: string) => {
            setDocksByProject((prev) => {
                if (!prev?.[projectUuid]) return prev ?? {};
                return {
                    ...prev,
                    [projectUuid]: prev[projectUuid].filter(
                        (x) => x.threadId !== threadId,
                    ),
                };
            });
            aiAgentStore.dispatch(dockItemRemoved({ threadId }));
        },
        [setDocksByProject],
    );

    const value = useMemo(
        () => ({ docksByProject: docksByProject ?? {}, addItem, removeItem }),
        [docksByProject, addItem, removeItem],
    );

    return (
        <LauncherDockContext.Provider value={value}>
            {children}
        </LauncherDockContext.Provider>
    );
};
