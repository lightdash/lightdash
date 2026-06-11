import { useCallback, useContext } from 'react';
import { type LauncherDockItem } from '../../store/aiAgentLauncherSlice';
import { LauncherDockContext } from './LauncherDockContext';

const EMPTY_DOCK: LauncherDockItem[] = [];

export const useLauncherDock = (projectUuid: string | undefined) => {
    const ctx = useContext(LauncherDockContext);
    if (!ctx) {
        throw new Error(
            'useLauncherDock must be used within LauncherDockProvider',
        );
    }

    const dock = projectUuid
        ? (ctx.docksByProject[projectUuid] ?? EMPTY_DOCK)
        : EMPTY_DOCK;

    const addItem = useCallback(
        (item: LauncherDockItem) => {
            if (!projectUuid) return;
            ctx.addItem(projectUuid, item);
        },
        [projectUuid, ctx],
    );

    const removeItem = useCallback(
        (threadId: string) => {
            if (!projectUuid) return;
            ctx.removeItem(projectUuid, threadId);
        },
        [projectUuid, ctx],
    );

    return { dock, addItem, removeItem };
};
