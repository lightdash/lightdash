import moment from 'moment';
import { useEffect, useState } from 'react';
import { useInterval } from 'react-use';

export const useTimeAgo = (timeStamp: Date, interval: number = 10000) => {
    const [timeAgo, setTimeAgo] = useState<string>(moment(timeStamp).fromNow());
    useInterval(() => {
        setTimeAgo(moment(timeStamp).fromNow());
    }, interval);
    useEffect(() => {
        setTimeAgo(moment(timeStamp).fromNow());
    }, [timeStamp]);
    return timeAgo;
};
