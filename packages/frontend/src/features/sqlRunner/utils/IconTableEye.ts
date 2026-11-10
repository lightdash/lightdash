import { createReactComponent } from '@tabler/icons-react';

// Tabler has table-plus, table-heart and friends but no table-eye; this keeps
// the same truncated table body and puts a small eye in the corner.
export const IconTableEye = createReactComponent('table-eye', 'IconTableEye', [
    [
        'path',
        {
            d: 'M12.5 21h-7.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v7.5',
            key: 'svg-0',
        },
    ],
    ['path', { d: 'M3 10h18', key: 'svg-1' }],
    ['path', { d: 'M10 3v18', key: 'svg-2' }],
    [
        'path',
        {
            d: 'M23.5 18.5c-1.3 2.3 -3 3.5 -5 3.5s-3.7 -1.2 -5 -3.5c1.3 -2.3 3 -3.5 5 -3.5s3.7 1.2 5 3.5',
            key: 'svg-3',
        },
    ],
    [
        'path',
        {
            d: 'M17.5 18.5a1 1 0 1 0 2 0a1 1 0 0 0 -2 0',
            key: 'svg-4',
        },
    ],
]);
