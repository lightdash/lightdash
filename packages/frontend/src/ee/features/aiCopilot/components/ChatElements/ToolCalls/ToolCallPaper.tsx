import {
    Collapse,
    Group,
    type MantineStyleProp,
    Paper,
    Title,
    UnstyledButton,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { IconExclamationCircle, IconSelector } from '@tabler/icons-react';
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
    hasError?: boolean;
    rightAction?: ReactNode;
};

export const ToolCallPaper = ({
    children,
    title,
    icon,
    defaultOpened = true,
    variant = 'default',
    hasError,
    rightAction,
}: ToolCallPaperProps) => {
    const [opened, { toggle }] = useDisclosure(defaultOpened);

    const styles: MantineStyleProp = (theme) => ({
        borderStyle: variant === 'dashed' ? 'dashed' : null,
        borderColor: hasError ? theme.colors.red[3] : '',
    });
    const contentColor = hasError ? 'red.6' : 'gray.6';

    return (
        <Paper
            withBorder
            p="xs"
            radius="md"
            style={styles}
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
                            color="gray.6"
                        />
                    </Group>
                </Group>
            </UnstyledButton>
            <Collapse in={opened} style={{ opacity: hasError ? 0.6 : 1 }}>
                {children}
            </Collapse>
        </Paper>
    );
};
