// PROTOTYPE (throwaway): floating bar that cycles ?variant=
import { ActionIcon, Group, Paper, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useCallback, useEffect, type FC } from 'react';
import { useSearchParams } from 'react-router';
import MantineIcon from '../MantineIcon';
import styles from './PrototypeSwitcher.module.css';

type Props = {
    variants: ReadonlyArray<{ key: string; name: string }>;
};

export const PrototypeSwitcher: FC<Props> = ({ variants }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const currentKey = searchParams.get('variant') ?? variants[0].key;
    const index = Math.max(
        0,
        variants.findIndex((v) => v.key === currentKey),
    );

    const go = useCallback(
        (step: number) => {
            const next =
                variants[(index + step + variants.length) % variants.length];
            setSearchParams(
                (prev) => {
                    const p = new URLSearchParams(prev);
                    p.set('variant', next.key);
                    return p;
                },
                { replace: true },
            );
        },
        [index, variants, setSearchParams],
    );

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (
                t?.closest('input, textarea, [contenteditable="true"]') ||
                (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')
            )
                return;
            if (!e.altKey) return;
            go(e.key === 'ArrowLeft' ? -1 : 1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [go]);

    if (import.meta.env.PROD) return null;

    return (
        <Paper className={styles.bar} data-prototype-switcher>
            <Group gap="xs" wrap="nowrap">
                <ActionIcon
                    aria-label="Previous variant"
                    variant="transparent"
                    c="white"
                    onClick={() => go(-1)}
                >
                    <MantineIcon icon={IconChevronLeft} />
                </ActionIcon>
                <Text fz="sm" c="white" fw={500}>
                    {variants[index].key} · {variants[index].name}
                </Text>
                <ActionIcon
                    aria-label="Next variant"
                    variant="transparent"
                    c="white"
                    onClick={() => go(1)}
                >
                    <MantineIcon icon={IconChevronRight} />
                </ActionIcon>
            </Group>
        </Paper>
    );
};
