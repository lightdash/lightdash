import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
        return formatDistanceToNowStrict(parsed, {
            addSuffix: true,
            roundingMethod: 'floor',
        });
    }, [parsed]);

    const [timeAgo, setTimeAgo] = useState<string>(getTimeAgo());

    useInterval(() => {
        setTimeAgo(getTimeAgo());
    }, interval);

    useEffect(() => {
        setTimeAgo(getTimeAgo());
    }, [parsed, getTimeAgo]);

    return timeAgo;
};
