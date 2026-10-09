import { createReactComponent } from '@tabler/icons-react';

// Tabler's circle-dashed-check, which ships only in @tabler/icons-react v3
const IconCircleDashedCheck = createReactComponent(
    'circle-dashed-check',
    'IconCircleDashedCheck',
    [
        ['path', { d: 'M8.56 3.69a9 9 0 0 0 -2.92 1.95', key: 'arc1' }],
        ['path', { d: 'M3.69 8.56a9 9 0 0 0 -.69 3.44', key: 'arc2' }],
        ['path', { d: 'M3.69 15.44a9 9 0 0 0 1.95 2.92', key: 'arc3' }],
        ['path', { d: 'M8.56 20.31a9 9 0 0 0 3.44 .69', key: 'arc4' }],
        ['path', { d: 'M15.44 20.31a9 9 0 0 0 2.92 -1.95', key: 'arc5' }],
        ['path', { d: 'M20.31 15.44a9 9 0 0 0 .69 -3.44', key: 'arc6' }],
        ['path', { d: 'M20.31 8.56a9 9 0 0 0 -1.95 -2.92', key: 'arc7' }],
        ['path', { d: 'M15.44 3.69a9 9 0 0 0 -3.44 -.69', key: 'arc8' }],
        ['path', { d: 'M9 12l2 2l4 -4', key: 'check' }],
    ],
);

export default IconCircleDashedCheck;
