import { Loader, Stack, Text } from '@mantine/core';
import React, { FC } from 'react';
import MantineIcon, { MantineIconProps } from '../MantineIcon';

interface Props extends React.ComponentPropsWithoutRef<'div'> {
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
            sx={{
                height: '100%',
                width: '100%',
                alignContent: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                alignItems: 'center',
            }}
            {...rest}
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
