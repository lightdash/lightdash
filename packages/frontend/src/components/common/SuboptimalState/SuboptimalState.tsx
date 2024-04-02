import { Loader, Stack, Text, type StackProps } from '@mantine/core';
import React, { type FC } from 'react';
import MantineIcon, { type MantineIconProps } from '../MantineIcon';

interface Props extends StackProps {
    icon?: MantineIconProps['icon'];
    title?: string;
    description?: string | JSX.Element;
    action?: JSX.Element;
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
            spacing="sm"
            {...rest}
            sx={{
                height: '100%',
                width: '100%',
                alignContent: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                alignItems: 'center',
                ...rest?.sx,
            }}
        >
            {loading && <Loader color="gray.6" />}
            {icon && !loading && (
                <MantineIcon color="gray.5" size="xxl" icon={icon} />
            )}
            {title && (
                <Text color="gray.7" fz={18} fw={600}>
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
