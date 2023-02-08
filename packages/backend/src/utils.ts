import { ParameterError, validateEmail } from '@lightdash/common';
import {
    DbPinnedChart,
    DbPinnedDashboard,
} from './database/entities/pinnedList';

export const sanitizeStringParam = (value: any) => {
    if (!value || typeof value !== 'string') {
        throw new ParameterError();
    }
    const trimmedValue = value.trim();
    if (trimmedValue.length <= 0) {
        throw new ParameterError();
    }
    return trimmedValue;
};

export const sanitizeEmailParam = (value: any) => {
    const email = sanitizeStringParam(value);
    if (!validateEmail(email)) {
        throw new ParameterError();
    }
    return email;
};

export const isDbPinnedChart = (
    data: DbPinnedChart | DbPinnedDashboard,
): data is DbPinnedChart =>
    'saved_chart_uuid' in data && !!data.saved_chart_uuid;
