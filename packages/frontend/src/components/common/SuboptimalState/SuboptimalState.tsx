import { Loader, Stack, Text, type StackProps } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import MantineIcon, { type MantineIconProps } from '../MantineIcon';

interface Props extends StackProps {
    icon?: MantineIconProps['icon'];
    title?: string;
    description?: string | ReactNode;
    action?: ReactNode;
    loading?: boolean;
}

const SuboptimalState: FC<Props> = ({
    icon,
    title,
    description,
    action,
    loading,
    ...rest
}) => {
    return (
        <Stack
            gap="sm"
            h="100%"
            w="100%"
            align="center"
            justify="center"
            ta="center"
            {...rest}
        >
            {loading && <Loader color="gray.6" />}
            {icon && !loading && (
                <MantineIcon color="gray.5" size="xxl" icon={icon} />
            )}
            {title && (
                <Text
                    c="gray.7"
                    fz={18}
                    fw={600}
                    style={{ whiteSpace: 'pre-wrap' }}
                >
                    {title}
                </Text>
            )}
            {description && typeof description === 'string' ? (
                <Text maw={400}>{description}</Text>
            ) : (
                description
            )}
            {action && action}
        </Stack>
    );
};

export default SuboptimalState;
