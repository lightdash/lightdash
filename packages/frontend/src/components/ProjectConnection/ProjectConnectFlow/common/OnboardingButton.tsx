import {
    Flex,
    Stack,
    Text,
    UnstyledButton,
    type UnstyledButtonProps,
} from '@mantine/core';
import { type FC } from 'react';

type OnboardingButtonProps = UnstyledButtonProps &
    React.ComponentPropsWithRef<'div'> & {
        leftIcon?: React.ReactNode;
        rightIcon?: React.ReactNode;
        description?: React.ReactNode;
    };

const OnboardingButton: FC<React.PropsWithChildren<OnboardingButtonProps>> = ({
    children,
    description,
    leftIcon,
    rightIcon,
    ...rest
}) => (
    <UnstyledButton
        component="div"
        role="button"
        {...rest}
        sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            height: theme.spacing['5xl'],
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: theme.colors.ldGray[3],
            paddingLeft: theme.spacing.md,
            paddingRight: theme.spacing.md,
            borderRadius: theme.radius.sm,

            '&:hover': {
                borderColor: theme.colors.ldGray[4],
                backgroundColor: theme.colors.ldGray[0],
            },

            '&:active': {
                position: 'relative',
                top: 1,
            },
        })}
    >
        <Stack sx={{ flexGrow: 1 }}>
            <Flex gap="sm" align="center">
                {leftIcon}

                <Stack spacing="xxs" sx={{ flexGrow: 1 }}>
                    <Text size="sm" fw={500}>
                        {children}
                    </Text>

                    {description && (
                        <Text size="xs" color="dimmed">
                            {description}
                        </Text>
                    )}
                </Stack>

                {rightIcon}
            </Flex>
        </Stack>
    </UnstyledButton>
);

export default OnboardingButton;
