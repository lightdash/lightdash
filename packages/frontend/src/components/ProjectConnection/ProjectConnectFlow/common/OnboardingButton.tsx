import {
    Flex,
    Stack,
    Text,
    UnstyledButton,
    type UnstyledButtonProps,
} from '@mantine-8/core';
import { type FC } from 'react';
import styles from './OnboardingButton.module.css';

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
        className={styles.button}
    >
        <Stack flex={1}>
            <Flex gap="sm" align="center">
                {leftIcon}

                <Stack gap="xxs" flex={1}>
                    <Text fz="sm" fw={500}>
                        {children}
                    </Text>

                    {description && (
                        <Text fz="xs" c="dimmed">
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
