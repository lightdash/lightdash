import { type AiThreadMetadata } from '@lightdash/common';
import { Badge, Group, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import styles from './ThreadMetadataSection.module.css';

type Props = {
    metadata: AiThreadMetadata;
};

export const ThreadMetadataSection: FC<Props> = ({ metadata }) => {
    const entries = Object.entries(metadata).sort(([a], [b]) =>
        a.localeCompare(b),
    );

    return (
        <Stack p="sm" gap="sm">
            <Group justify="space-between" align="center">
                <Group gap="xs" align="baseline">
                    <Title order={6}>Metadata</Title>
                    <Text fz="xs" c="dimmed">
                        Supplied by the API caller
                    </Text>
                </Group>
                <Badge variant="default">{entries.length}</Badge>
            </Group>
            <dl className={styles.list}>
                {entries.map(([key, value]) => (
                    <div key={key} className={styles.row}>
                        <Text
                            component="dt"
                            fz="xs"
                            c="dimmed"
                            ff="monospace"
                            className={styles.key}
                        >
                            {key}
                        </Text>
                        <Text component="dd" fz="sm" className={styles.value}>
                            {value}
                        </Text>
                    </div>
                ))}
            </dl>
        </Stack>
    );
};
