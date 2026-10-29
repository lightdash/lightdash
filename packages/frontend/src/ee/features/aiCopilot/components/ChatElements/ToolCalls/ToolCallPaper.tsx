import { Collapse, Group, Paper, Title, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconExclamationCircle, IconSelector } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import MantineIcon, {
    type MantineIconProps,
} from '../../../../../../components/common/MantineIcon';
import classes from './ToolCallPaper.module.css';

type ToolCallPaperProps = {
    children: ReactNode;
    title: ReactNode;
    icon: MantineIconProps['icon'];
    defaultOpened?: boolean;
    variant?: 'default' | 'dashed';
    hasError?: boolean;
    rightAction?: ReactNode;
    iconClassName?: string;
};

export const ToolCallPaper = ({
    children,
    title,
    icon,
    defaultOpened = true,
    variant = 'default',
    hasError,
    rightAction,
    iconClassName,
}: ToolCallPaperProps) => {
    const [opened, { toggle }] = useDisclosure(defaultOpened);

    const contentColor = hasError ? 'red.6' : 'ldGray.6';

    return (
        <Paper
            p="xs"
            radius="md"
            className={classes.paper}
            data-dashed={variant === 'dashed'}
            data-error={hasError === true}
            shadow={opened ? 'none' : undefined}
        >
            <UnstyledButton onClick={toggle} w="100%" h="18px">
                <Group justify="space-between" w="100%" h="100%">
                    <Group gap="xs">
                        <MantineIcon
                            icon={hasError ? IconExclamationCircle : icon}
                            size="sm"
                            strokeWidth={1.2}
                            color={contentColor}
                            className={iconClassName}
                        />
                        <Title order={6} c={contentColor} size="xs">
                            {title}
                        </Title>
                    </Group>
                    <Group gap="xs">
                        {rightAction}
                        <MantineIcon
                            icon={IconSelector}
                            size={12}
                            color="dimmed"
                        />
                    </Group>
                </Group>
            </UnstyledButton>
            <Collapse expanded={opened} opacity={hasError ? 0.6 : 1}>
                {children}
            </Collapse>
        </Paper>
    );
};
