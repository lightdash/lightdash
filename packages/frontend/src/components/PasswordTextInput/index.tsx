import {
    getPasswordSchema,
    PASSWORD_REQUIREMENT_MESSAGES,
} from '@lightdash/common';
import {
    Group,
    Popover,
    Progress,
    Stack,
    Text,
    useMatches,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCheck, IconX } from '@tabler/icons-react';
import React, { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

const PasswordRequirement = ({
    meets,
    label,
}: {
    meets: boolean;
    label: string;
}) => {
    return (
        <Group
            gap="xs"
            wrap="nowrap"
            align="flex-start"
            c={meets ? 'teal' : 'red'}
        >
            {meets ? (
                <MantineIcon icon={IconCheck} />
            ) : (
                <MantineIcon icon={IconX} />
            )}

            <Text size="sm">{label}</Text>
        </Group>
    );
};

type Props = {
    passwordValue: string;
    children: React.ReactNode;
};

const passwordSchema = getPasswordSchema();
const checks = PASSWORD_REQUIREMENT_MESSAGES;

const PasswordTextInput: FC<React.PropsWithChildren<Props>> = ({
    passwordValue,
    children,
}) => {
    const isCompact = useMatches({ base: true, sm: false });
    const [isPopoverOpen, { open: openPopover, close: closePopover }] =
        useDisclosure();

    const validation = passwordSchema.safeParse(passwordValue);

    const fails = !validation.success
        ? validation.error.issues.map((error) => error.message)
        : [];

    const strength = Math.ceil(
        ((checks.length - fails.length) / checks.length) * 100,
    );

    const requirements = (
        <Stack gap="xs">
            <Progress
                color={
                    strength === 100 ? 'teal' : strength > 50 ? 'yellow' : 'red'
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
    );

    return (
        <Stack gap="xs">
            <Popover
                opened={isPopoverOpen && !isCompact}
                position="bottom"
                width="target"
                transitionProps={{ transition: 'pop' }}
            >
                <Popover.Target>
                    <div
                        onFocusCapture={openPopover}
                        onBlurCapture={closePopover}
                    >
                        {children}
                    </div>
                </Popover.Target>
                <Popover.Dropdown>{requirements}</Popover.Dropdown>
            </Popover>
            {isCompact && requirements}
        </Stack>
    );
};

export default PasswordTextInput;
