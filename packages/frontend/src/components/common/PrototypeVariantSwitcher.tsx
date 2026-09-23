import { ActionIcon, Group, Paper, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useCallback, useEffect } from 'react';
import MantineIcon from './MantineIcon';
import { type PrototypeVariant } from './usePrototypeVariant';

// PROTOTYPE ONLY. Floating bar that cycles `?variant=` on the current
// route. Dev builds only; never ships.

const isTypingTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);

export const PrototypeVariantSwitcher = <K extends string>({
    variants,
    current,
    onChange,
}: {
    variants: readonly PrototypeVariant<K>[];
    current: K;
    onChange: (key: K) => void;
}) => {
    const index = variants.findIndex((variant) => variant.key === current);
    const cycle = useCallback(
        (delta: number) => {
            const next = (index + delta + variants.length) % variants.length;
            onChange(variants[next].key);
        },
        [index, variants, onChange],
    );

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (isTypingTarget(event.target)) return;
            if (event.key === 'ArrowLeft') cycle(-1);
            if (event.key === 'ArrowRight') cycle(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [cycle]);

    if (!import.meta.env.DEV) return null;

    return (
        <Paper
            pos="fixed"
            bottom={16}
            left={72}
            style={{ zIndex: 10000 }}
            px="sm"
            py={6}
            radius="xl"
            bg="dark.9"
            c="white"
            shadow="lg"
        >
            <Group gap="xs" wrap="nowrap">
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Previous variant"
                    onClick={() => cycle(-1)}
                >
                    <MantineIcon icon={IconChevronLeft} color="white" />
                </ActionIcon>
                <Text fz="xs" fw={600} style={{ whiteSpace: 'nowrap' }}>
                    PROTOTYPE {current} — {variants[index].name}
                </Text>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Next variant"
                    onClick={() => cycle(1)}
                >
                    <MantineIcon icon={IconChevronRight} color="white" />
                </ActionIcon>
            </Group>
        </Paper>
    );
};
