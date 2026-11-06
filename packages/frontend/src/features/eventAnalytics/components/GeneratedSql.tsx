import { Code, Collapse, Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';

type Props = {
    sql: string | null;
    durationMs: number | null;
};

const formatDuration = (ms: number) =>
    ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

/** Collapsible view of the SQL behind a result, with the warehouse round trip time. */
export const GeneratedSql: FC<Props> = ({ sql, durationMs }) => {
    const [opened, setOpened] = useState(false);

    if (!sql) return null;

    return (
        <>
            <UnstyledButton onClick={() => setOpened(!opened)}>
                <Group gap="xs">
                    {opened ? (
                        <IconChevronDown size={16} />
                    ) : (
                        <IconChevronRight size={16} />
                    )}
                    <Text size="sm" c="dimmed">
                        {opened ? 'Hide generated SQL' : 'Show generated SQL'}
                    </Text>
                    {durationMs !== null && (
                        <Text size="sm" c="dimmed">
                            · ran in {formatDuration(durationMs)}
                        </Text>
                    )}
                </Group>
            </UnstyledButton>
            <Collapse expanded={opened}>
                <Code block mt="xs">
                    {sql}
                </Code>
            </Collapse>
        </>
    );
};
