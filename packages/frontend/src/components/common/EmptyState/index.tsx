import {
    DefaultProps,
    Stack,
    Text,
    TextProps,
    Title,
    TitleProps,
} from '@mantine/core';
import { FC, ReactNode } from 'react';

type EmptyStateProps = DefaultProps & {
    icon?: ReactNode;
    title?: ReactNode;
    titleProps?: TitleProps;
    description?: ReactNode;
    descriptionProps?: TextProps;
};

export const EmptyState: FC<React.PropsWithChildren<EmptyStateProps>> = ({
    icon,
    title,
    titleProps,
    description,
    descriptionProps,
    children,
    maw = 400,
    ...defaultMantineProps
}) => (
    <Stack align="center" pt="4xl" pb="5xl" {...defaultMantineProps}>
        {icon}

        {title ? (
            <Title align="center" fw={500} order={4} maw={maw} {...titleProps}>
                {title}
            </Title>
        ) : null}

        {description ? (
            <Text
                span
                align="center"
                color="dimmed"
                maw={maw}
                {...descriptionProps}
            >
                {description}
            </Text>
        ) : null}

        {children}
    </Stack>
);
