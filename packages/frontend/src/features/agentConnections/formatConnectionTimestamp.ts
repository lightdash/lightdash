import dayjs from 'dayjs';

export const formatConnectionTimestamp = (value: string) => {
    const date = dayjs(value).locale('en');
    return date.format(
        date.year() === dayjs().year() ? 'D MMM, HH:mm' : 'D MMM YYYY, HH:mm',
    );
};
