import { useInterval } from '@mantine/hooks';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDateFnsLocale } from '../i18n/dateLocale';
import { useStableCallback } from './useStableCallback';

export const useTimeAgo = (
    dateOrString: Date | string,
    interval: number = 10000,
) => {
    const { i18n } = useTranslation();
    const language = i18n.language;
    const parsed = useMemo(() => {
        return typeof dateOrString === 'string'
            ? parseISO(dateOrString)
            : dateOrString;
    }, [dateOrString]);

    const getTimeAgo = useCallback(() => {
        return formatDistanceToNow(parsed, {
            addSuffix: true,
            locale: getDateFnsLocale(language),
        });
    }, [parsed, language]);

    const [timeAgo, setTimeAgo] = useState<string>(getTimeAgo());
    const timeAgoRef = useRef(timeAgo);
    const updateTimeAgo = useCallback(() => {
        const nextTimeAgo = getTimeAgo();

        if (timeAgoRef.current === nextTimeAgo) return;

        timeAgoRef.current = nextTimeAgo;
        setTimeAgo(nextTimeAgo);
    }, [getTimeAgo]);

    // Callers often pass a fresh Date each render; the interval restarts on
    // every callback change, so the tick must stay identity-stable.
    const tick = useStableCallback(updateTimeAgo);
    useInterval(tick, interval, { autoInvoke: true });

    useEffect(() => {
        updateTimeAgo();
    }, [parsed, updateTimeAgo]);

    return timeAgo;
};
