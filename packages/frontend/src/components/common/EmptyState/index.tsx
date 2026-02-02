import {
    Stack,
    Text,
    Title,
    type BoxProps,
    type StackProps,
    type TextProps,
    type TitleProps,
} from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';

type EmptyStateProps = BoxProps & {
    icon?: ReactNode;
    title?: ReactNode;
    titleProps?: TitleProps;
    description?: ReactNode;
    descriptionProps?: TextProps;
    justify?: StackProps['justify'];
};

export const EmptyState: FC<React.PropsWithChildren<EmptyStateProps>> = ({
    icon,
    title,
    titleProps,
    description,
    descriptionProps,
    children,
    maw = 400,
    ...defaultMantinePropsWithJustify
}) => (
    <Stack align="center" pt="4xl" pb="5xl" {...defaultMantinePropsWithJustify}>
        {icon}

        {title ? (
            <Title ta="center" fw={500} order={4} maw={maw} {...titleProps}>
                {title}
            </Title>
        ) : null}

        {description ? (
            <Text
                span
                ta="center"
                c="dimmed"
                maw={maw}
                {...descriptionProps}
            >
                {description}
            </Text>
        ) : null}

        {children}
    </Stack>
);
