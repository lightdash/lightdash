import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useState } from 'react';
import { useInterval } from 'react-use';

dayjs.extend(relativeTime);

export const useTimeAgo = (timeStamp: Date, interval: number = 10000) => {
    const [timeAgo, setTimeAgo] = useState<string>(dayjs(timeStamp).fromNow());
    useInterval(() => {
        setTimeAgo(dayjs(timeStamp).fromNow());
    }, interval);
    useEffect(() => {
        setTimeAgo(dayjs(timeStamp).fromNow());
    }, [timeStamp]);
    return timeAgo;
};
