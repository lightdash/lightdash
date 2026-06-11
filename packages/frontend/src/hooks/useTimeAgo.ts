import { formatDistanceToNow, parseISO } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInterval } from 'react-use';

export const useTimeAgo = (
    dateOrString: Date | string,
    interval: number = 10000,
) => {
    const parsed = useMemo(() => {
        return typeof dateOrString === 'string'
            ? parseISO(dateOrString)
            : dateOrString;
    }, [dateOrString]);

    const getTimeAgo = useCallback(() => {
        const timeAgo = formatDistanceToNow(parsed, {
            addSuffix: true,
        });

        return timeAgo;
    }, [parsed]);

    const [timeAgo, setTimeAgo] = useState<string>(getTimeAgo());
    const timeAgoRef = useRef(timeAgo);
    const updateTimeAgo = useCallback(() => {
        const nextTimeAgo = getTimeAgo();

        if (timeAgoRef.current === nextTimeAgo) return;

        timeAgoRef.current = nextTimeAgo;
        setTimeAgo(nextTimeAgo);
    }, [getTimeAgo]);

    useInterval(() => {
        updateTimeAgo();
    }, interval);

    useEffect(() => {
        updateTimeAgo();
    }, [parsed, updateTimeAgo]);

    return timeAgo;
};
