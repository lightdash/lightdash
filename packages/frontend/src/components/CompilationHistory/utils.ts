import { format } from 'date-fns';

export const formatTime = (date: Date) => format(date, 'yyyy/MM/dd hh:mm a');
