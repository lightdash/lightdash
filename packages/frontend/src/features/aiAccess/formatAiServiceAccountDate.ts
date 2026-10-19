import dayjs from 'dayjs';

export const formatAiServiceAccountDate = (date: Date) =>
    dayjs(date).format('D MMM YYYY');
