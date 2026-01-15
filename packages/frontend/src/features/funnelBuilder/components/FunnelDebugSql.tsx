import { Code, Collapse, Group, Text, UnstyledButton } from '@mantine-8/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { useAppSelector } from '../store';
import { selectResults } from '../store/funnelBuilderSlice';

export const FunnelDebugSql: FC = () => {
    const results = useAppSelector(selectResults);
    const [opened, setOpened] = useState(false);

    if (!results?.sql) return null;

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
                        View Generated SQL
                    </Text>
                </Group>
            </UnstyledButton>
            <Collapse in={opened}>
                <Code block mt="xs">
                    {results.sql}
                </Code>
            </Collapse>
        </>
    );
};
