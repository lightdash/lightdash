import { useInterval } from '@mantine/hooks';
import { useState } from 'react';

export const useElapsedMs = (startedAt: Date | null): number => {
    const [now, setNow] = useState(() => Date.now());
    useInterval(() => setNow(Date.now()), 1000, { autoInvoke: true });
    return startedAt ? now - startedAt.getTime() : 0;
};
