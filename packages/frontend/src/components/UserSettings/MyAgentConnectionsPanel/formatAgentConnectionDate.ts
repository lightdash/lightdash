import dayjs from 'dayjs';

export const formatAgentConnectionDate = (date: Date): string =>
    dayjs(date).locale('en').format('D MMM YYYY');
