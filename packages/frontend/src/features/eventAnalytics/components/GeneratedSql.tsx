import { Code, Collapse, Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';

type Props = {
    sql: string | null;
};

/** Collapsible view of the SQL behind a result. */
export const GeneratedSql: FC<Props> = ({ sql }) => {
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
