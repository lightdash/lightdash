import {
    Group,
    Stack,
    Text,
    UnstyledButton,
    UnstyledButtonProps,
} from '@mantine/core';
import { FC } from 'react';

type OnboardingButtonProps = UnstyledButtonProps &
    React.ComponentPropsWithRef<'div'> & {
        leftIcon?: React.ReactNode;
        description?: React.ReactNode;
    };

const OnboardingButton: FC<OnboardingButtonProps> = ({
    leftIcon,
    children,
    description,
    ...rest
}) => (
    <UnstyledButton
        component="div"
        {...rest}
        sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            height: theme.spacing['5xl'],
            border: `1px solid ${theme.colors.gray[3]}`,
            paddingLeft: theme.spacing.md,
            paddingRight: theme.spacing.md,
            borderRadius: theme.radius.sm,

            '&:hover': {
                border: `1px solid ${theme.colors.gray[4]}`,
                backgroundColor: theme.colors.gray[0],
            },

            '&:active': {
                backgroundColor: theme.colors.gray[1],
                position: 'relative',
                top: 1,
            },
        })}
    >
        <Stack justify="left">
            <Group spacing="sm" noWrap>
                {leftIcon}

                <Stack spacing="xxs">
                    <Text size="sm" fw={500}>
                        {children}
                    </Text>

                    {description && (
                        <Text size="xs" color="dimmed">
                            {description}
                        </Text>
                    )}
                </Stack>
            </Group>
        </Stack>
    </UnstyledButton>
);

export default OnboardingButton;
