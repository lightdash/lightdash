import { Box, Popover, Progress, Text } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import React, { FC, useState } from 'react';

function PasswordRequirement({
    meets,
    label,
}: {
    meets: boolean;
    label: string;
}) {
    return (
        <Text
            color={meets ? 'teal' : 'red'}
            sx={{ display: 'flex', alignItems: 'center' }}
            mt={7}
            size="sm"
        >
            {meets ? <IconCheck size="0.9rem" /> : <IconX size="0.9rem" />}{' '}
            <Box ml={10}>{label}</Box>
        </Text>
    );
}

const requirements = [
    { re: /[a-zA-Z]/, label: 'Includes letter' },
    { re: /[\d\W_]/, label: 'Includes number or symbol' },
    { re: /^.{8,}$/, label: 'Includes at least 8 characters' },
];

function getStrength(password: string): number {
    let multiplier = password.length > 5 ? 0 : 1;

    requirements.forEach((requirement) => {
        if (!requirement.re.test(password)) {
            multiplier += 1;
        }
    });

    return Math.max(100 - (100 / (requirements.length + 1)) * multiplier, 10);
}

type Props = {
    passwordValue: string;
    children: React.ReactNode;
};

const PasswordTextInput: FC<Props> = ({ passwordValue, children }) => {
    const [popoverOpened, setPopoverOpened] = useState(false);

    const checks = requirements.map((requirement, index) => (
        <PasswordRequirement
            key={index}
            label={requirement.label}
            meets={requirement.re.test(passwordValue)}
        />
    ));

    const strength = getStrength(passwordValue);
    const color = strength === 100 ? 'teal' : strength > 50 ? 'yellow' : 'red';

    return (
        <Popover
            opened={popoverOpened}
            position="bottom"
            withinPortal
            width="target"
            transitionProps={{ transition: 'pop' }}
        >
            <Popover.Target>
                <div
                    onFocusCapture={() => setPopoverOpened(true)}
                    onBlurCapture={() => setPopoverOpened(false)}
                >
                    {children}
                </div>
            </Popover.Target>
            <Popover.Dropdown>
                <Progress color={color} value={strength} size={5} mb="xs" />
                {checks}
            </Popover.Dropdown>
        </Popover>
    );
};

export default PasswordTextInput;
