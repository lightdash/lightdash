import { useEffect, useState } from 'react';
import {
    formatElapsed,
    getWritebackStepIndex,
} from '../components/ChatElements/ToolCalls/writebackProgress';
import { useWritebackRunStatus } from './useWritebackRunStatus';

/** How long ago `startedAt` was, ticking each second; null without a start. */
export const useElapsed = (startedAt: string | null): string | null => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!startedAt) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [startedAt]);
    return startedAt
        ? formatElapsed(now - new Date(startedAt).getTime())
        : null;
};

/** The step a background dbt change is on, read from its run. */
export const useWritebackStep = (
    projectUuid: string,
    aiWritebackRunUuid: string | null,
): number => {
    const { data } = useWritebackRunStatus(projectUuid, aiWritebackRunUuid);
    return data ? getWritebackStepIndex(data.status) : 0;
};
