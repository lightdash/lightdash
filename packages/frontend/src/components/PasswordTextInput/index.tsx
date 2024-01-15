import { getPasswordSchema } from '@lightdash/common';
import { Group, Popover, Progress, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCheck, IconX } from '@tabler/icons-react';
import React, { FC } from 'react';
import MantineIcon from '../common/MantineIcon';

const PasswordRequirement = ({
    meets,
    label,
}: {
    meets: boolean;
    label: string;
}) => {
    return (
        <Group spacing="xs" c={meets ? 'teal' : 'red'}>
            {meets ? (
                <MantineIcon icon={IconCheck} />
            ) : (
                <MantineIcon icon={IconX} />
            )}

            <Text>{label}</Text>
        </Group>
    );
};

type Props = {
    passwordValue: string;
    children: React.ReactNode;
};

const passwordSchema = getPasswordSchema();
const checks = passwordSchema._def.checks
    .map((check) => check.message)
    .filter((check): check is string => !!check);

const PasswordTextInput: FC<React.PropsWithChildren<Props>> = ({
    passwordValue,
    children,
}) => {
    const [isPopoverOpen, { open: openPopover, close: closePopover }] =
        useDisclosure();

    const validation = passwordSchema.safeParse(passwordValue);

    const fails = !validation.success
        ? validation.error.errors.map((error) => error.message)
        : [];

    const strength = Math.ceil(
        ((checks.length - fails.length) / checks.length) * 100,
    );

    return (
        <Popover
            opened={isPopoverOpen}
            position="bottom"
            withinPortal
            width="target"
            shadow="md"
            transitionProps={{ transition: 'pop' }}
        >
            <Popover.Target>
                <div onFocusCapture={openPopover} onBlurCapture={closePopover}>
                    {children}
                </div>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack spacing="xs">
                    <Progress
                        color={
                            strength === 100
                                ? 'teal'
                                : strength > 50
                                ? 'yellow'
                                : 'red'
                        }
                        value={strength}
                        size="sm"
                    />

                    {checks.map((check) => (
                        <PasswordRequirement
                            key={check}
                            meets={!fails.includes(check)}
                            label={check}
                        />
                    ))}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default PasswordTextInput;
