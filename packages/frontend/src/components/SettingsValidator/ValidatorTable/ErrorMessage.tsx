import {
    friendlyName,
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    ValidationResponse,
} from '@lightdash/common';
import { Badge, Stack, Text } from '@mantine/core';
import { FC, ReactNode } from 'react';

const CustomMark: FC<{ children: ReactNode }> = ({ children }) => {
    return (
        <Badge
            color="gray.7"
            component="mark"
            radius="xs"
            size="xs"
            p="xs"
            fw={600}
            fz="xs"
            sx={{
                textTransform: 'none',
            }}
        >
            {children}
        </Badge>
    );
};
const ErrorMessageByType: FC<{
    validationError: ValidationResponse;
}> = ({ validationError }) => {
    if (isTableValidationError(validationError) && validationError) {
        return <Text>{validationError.error}</Text>;
    }

    if (isChartValidationError(validationError)) {
        return (
            <Text>
                <CustomMark>{validationError.fieldName}</CustomMark> no longer
                exists
            </Text>
        );
    }

    if (isDashboardValidationError(validationError)) {
        return (
            <Text>
                {validationError.fieldName ? (
                    <>
                        <CustomMark>{validationError.fieldName}</CustomMark> no
                        longer exists
                    </>
                ) : (
                    <>
                        <CustomMark>{validationError.chartName}</CustomMark> is
                        broken
                    </>
                )}
            </Text>
        );
    }

    return null;
};

export const ErrorMessage: FC<{ validationError: ValidationResponse }> = ({
    validationError,
}) => {
    return (
        <Stack spacing={4}>
            <Text fw={600} color="red.6" fz={11}>
                {validationError.errorType
                    ? friendlyName(validationError.errorType)
                    : ''}{' '}
                error
            </Text>
            <ErrorMessageByType validationError={validationError} />
        </Stack>
    );
};
