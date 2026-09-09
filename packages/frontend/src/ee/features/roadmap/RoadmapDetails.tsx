import { Box, Group, Stack, Text } from '@mantine/core';
import { clsx } from 'clsx';
import { type ReactNode } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import styles from './RoadmapDetails.module.css';

export function RoadmapRailRow({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <Group className={styles.detailRailRow} wrap="nowrap" gap="sm">
            <Text className={styles.detailRailLabel}>{label}</Text>
            <Box className={styles.detailRailValue}>{children}</Box>
        </Group>
    );
}

export function RoadmapDetails({
    opened,
    onClose,
    title,
    description,
    propertiesLabel,
    children,
    actions,
    compact = false,
}: {
    compact?: boolean;
    actions: ReactNode;
    opened: boolean;
    onClose: () => void;
    title: string;
    description: ReactNode;
    propertiesLabel: string;
    children: ReactNode;
}) {
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            size={compact ? 'lg' : '72rem'}
            modalContentProps={{
                className: clsx(
                    styles.modalContent,
                    compact && styles.compactModalContent,
                ),
            }}
            title={
                <Text
                    component="span"
                    className={styles.detailHeaderTitle}
                    lineClamp={2}
                >
                    {title}
                </Text>
            }
            cancelLabel={false}
            actions={actions}
            modalBodyProps={{ px: 0, py: 0 }}
            bodyScrollAreaMaxHeight="calc(85vh - 120px)"
        >
            {opened && (
                <Box
                    className={styles.detailLayout}
                    data-compact={compact || undefined}
                >
                    <Stack className={styles.detailMain} gap={0}>
                        <Stack gap="md">
                            <Text className={styles.detailSectionLabel}>
                                Description
                            </Text>
                            {description}
                        </Stack>
                    </Stack>
                    <Stack
                        gap="sm"
                        className={styles.detailRailColumn}
                        component="aside"
                        aria-label={propertiesLabel}
                    >
                        <Stack gap={2}>{children}</Stack>
                    </Stack>
                </Box>
            )}
        </MantineModal>
    );
}
