import { Loader, Stack, Text, type StackProps } from '@mantine/core';
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
            {loading && <Loader color="ldGray.6" />}
            {icon && !loading && (
                <MantineIcon color="ldGray.5" size="xxl" icon={icon} />
            )}
            {title && (
                <Text
                    color="ldGray.7"
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
