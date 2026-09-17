import { Box, Collapse, Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useId, useState, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import styles from './DataAppVizInputGuidance.module.css';

const DataAppVizInputGuidance: FC<{ guidance?: string }> = ({ guidance }) => {
    const [opened, setOpened] = useState(false);
    const titleId = useId();
    const contentId = useId();

    if (!guidance?.trim()) return null;

    return (
        <Box role="region" aria-labelledby={titleId}>
            <UnstyledButton
                id={titleId}
                aria-expanded={opened}
                aria-controls={contentId}
                onClick={() => setOpened((current) => !current)}
            >
                <Group gap="xxs">
                    <Text size="xs" fw={500}>
                        How to use this chart
                    </Text>
                    <MantineIcon
                        icon={opened ? IconChevronDown : IconChevronRight}
                        size={14}
                    />
                </Group>
            </UnstyledButton>
            <Collapse id={contentId} expanded={opened}>
                <Text size="xs" c="dimmed" pt="xxs" className={styles.guidance}>
                    {guidance}
                </Text>
            </Collapse>
        </Box>
    );
};

export default DataAppVizInputGuidance;
