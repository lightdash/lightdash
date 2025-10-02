import { Collapse, Group, Paper, Title, UnstyledButton } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { IconSelector } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import MantineIcon, {
    type MantineIconProps,
} from '../../../../../../components/common/MantineIcon';

type ToolCallPaperProps = {
    children: ReactNode;
    title: ReactNode;
    icon: MantineIconProps['icon'];
    defaultOpened?: boolean;
    variant?: 'default' | 'dashed';
};

export const ToolCallPaper = ({
    children,
    title,
    icon,
    defaultOpened = true,
    variant = 'default',
}: ToolCallPaperProps) => {
    const [opened, { toggle }] = useDisclosure(defaultOpened);

    return (
        <Paper
            withBorder
            p="xs"
            radius="md"
            style={variant === 'dashed' ? { borderStyle: 'dashed' } : undefined}
            shadow={opened ? 'none' : undefined}
        >
            <UnstyledButton onClick={toggle} w="100%" h="18px">
                <Group justify="space-between" w="100%" h="100%">
                    <Group gap="xs">
                        <MantineIcon
                            icon={icon}
                            size="sm"
                            strokeWidth={1.2}
                            color="gray.6"
                        />
                        <Title order={6} c="gray.6" size="xs">
                            {title}
                        </Title>
                    </Group>
                    <MantineIcon icon={IconSelector} size={12} color="gray.6" />
                </Group>
            </UnstyledButton>
            <Collapse in={opened}>{children}</Collapse>
        </Paper>
    );
};
