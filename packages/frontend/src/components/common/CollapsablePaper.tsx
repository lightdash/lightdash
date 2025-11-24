import { Collapse, Group, Paper, Title, UnstyledButton } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { IconSelector } from '@tabler/icons-react';
import { type PropsWithChildren } from 'react';
import MantineIcon, { type MantineIconProps } from './MantineIcon';

type CollapsablePaperProps = PropsWithChildren<{
    title: string;
    defaultOpened?: boolean;
    icon?: MantineIconProps['icon'];
    rightAction?: React.ReactNode;
}>;

export const CollapsablePaper = ({
    title,
    children,
    defaultOpened = true,
    icon,
    rightAction,
}: CollapsablePaperProps) => {
    const [opened, { toggle }] = useDisclosure(defaultOpened);

    return (
        <Paper
            withBorder
            p="xs"
            radius="md"
            shadow={opened ? 'none' : undefined}
        >
            <UnstyledButton onClick={toggle} w="100%" h="18px">
                <Group justify="space-between" w="100%" h="100%">
                    <Group gap="xs">
                        {icon && (
                            <MantineIcon
                                icon={icon}
                                size="sm"
                                strokeWidth={1.2}
                                color={'ldGray.6'}
                            />
                        )}
                        <Title order={6} c={'ldGray.6'} size="xs">
                            {title}
                        </Title>
                    </Group>
                    <Group gap="xs">
                        {rightAction}
                        <MantineIcon
                            icon={IconSelector}
                            size={12}
                            color="ldGray.6"
                        />
                    </Group>
                </Group>
            </UnstyledButton>
            <Collapse in={opened}>{children}</Collapse>
        </Paper>
    );
};
