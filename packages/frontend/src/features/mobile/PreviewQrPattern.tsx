import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { PREVIEW_SIGN_IN_STRINGS } from './previewSignInState';

const CELLS = Array.from({ length: 49 }, (_, index) => ({
    key: index,
    x: (index % 7) * 14,
    y: Math.floor(index / 7) * 14,
    isLit: (index * 37) % 5 < 2,
}));

export const PreviewQrPattern: FC = () => (
    <Stack gap={6} align="center" w={112}>
        <svg viewBox="0 0 96 96" width={96} height={96} aria-hidden="true">
            {CELLS.map(({ key, x, y, isLit }) => (
                <rect
                    key={key}
                    x={x}
                    y={y}
                    width={12}
                    height={12}
                    fill={isLit ? '#5e4cff' : '#d1ccff'}
                />
            ))}
        </svg>
        <Text size="xs" fw={600} ta="center" c="dark.7" lh={1.2}>
            {PREVIEW_SIGN_IN_STRINGS.pattern}
        </Text>
    </Stack>
);
