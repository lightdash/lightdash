import { assertUnreachable } from '@lightdash/common';

export const serializeData = (
    data: unknown,
    type: 'json' | 'csv' | 'toon' | 'raw',
) => {
    switch (type) {
        case 'json':
            return ['```json', JSON.stringify(data, null, 2), '```'].join('\n');
        case 'csv':
            return ['```csv', data, '```'].join('\n');
        case 'toon':
            return ['```toon', data, '```'].join('\n');
        case 'raw':
            return ['```', data, '```'].join('\n');
        default:
            return assertUnreachable(type, 'Invalid data type');
    }
};
