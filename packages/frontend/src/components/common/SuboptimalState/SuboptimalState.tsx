import { Box, Loader, Stack, Text, type StackProps } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import MantineIcon, { type MantineIconProps } from '../MantineIcon';
import classes from './SuboptimalState.module.css';

interface Props extends StackProps {
    icon?: MantineIconProps['icon'];
    title?: string;
    description?: string | ReactNode;
    action?: ReactNode;
    loading?: boolean;
    /** Whether the component should adapt its layout to the available space. It requires the parent container to have a defined height and width. */
    adaptive?: boolean;
}

const SuboptimalState: FC<Props> = ({
    icon,
    title,
    description,
    action,
    loading,
    adaptive,
    ...rest
}) => {
    return (
        <Stack
            {...rest}
            h="100%"
            w="100%"
            align="center"
            justify="center"
            ta="center"
            className={adaptive ? classes.container : undefined}
            style={{
                alignItems: 'center',
                ...rest?.style,
            }}
        >
            {loading && (
                <Loader
                    color="ldGray.5"
                    size={title || description ? 'xs' : 'md'}
                    className={adaptive ? classes.supportIcon : undefined}
                />
            )}
            {icon && !loading && (
                <MantineIcon
                    color="ldGray.5"
                    size="lg"
                    icon={icon}
                    className={adaptive ? classes.supportIcon : undefined}
                />
            )}
            {title && (
                <Text
                    c="ldGray.8"
                    size="md"
                    fw={600}
                    style={{ whiteSpace: 'pre-wrap' }}
                    className={adaptive ? classes.title : undefined}
                >
                    {title}
                </Text>
            )}
            {description && (
                <Box c="dimmed" fz="xs" maw={400} mt={title ? -10 : 0}>
                    {typeof description === 'string' ? (
                        <Text
                            size="xs"
                            className={
                                adaptive ? classes.description : undefined
                            }
                        >
                            {description}
                        </Text>
                    ) : (
                        description
                    )}
                </Box>
            )}
            {action && action}
        </Stack>
    );
};

export default SuboptimalState;
