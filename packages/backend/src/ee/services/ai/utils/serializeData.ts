import { assertUnreachable } from '@lightdash/common';

export const serializeData = (data: unknown, type: 'json' | 'raw') => {
    switch (type) {
        case 'json':
            return ['```json', JSON.stringify(data, null, 2), '```'].join('\n');
        case 'raw':
            return ['```', data, '```'].join('\n');
        default:
            return assertUnreachable(type, 'Invalid data type');
    }
};
