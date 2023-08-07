import { PasswordValidationResult } from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import React from 'react';

const PasswordValidationMessages: React.FC<PasswordValidationResult> = ({
    isLengthValid,
    hasLetter,
    hasNumberOrSymbol,
}) => {
    const getColor = (status: boolean) => {
        return status ? 'green.6' : 'red.6';
    };

    return (
        <Stack spacing="xxs">
            <Text color={getColor(isLengthValid)}>
                Must be at least 8 characters long
            </Text>
            <Text color={getColor(hasNumberOrSymbol)}>
                Must contain at least one symbol or number
            </Text>
            <Text color={getColor(hasLetter)}>
                Must contain at least one letter
            </Text>
        </Stack>
    );
};

export default PasswordValidationMessages;
