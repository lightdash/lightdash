import {
    friendlyName,
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    ValidationResponse,
} from '@lightdash/common';
import { Mark, Stack, Text } from '@mantine/core';
import { FC } from 'react';

const CustomMark: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <Mark
        color="gray"
        px={2}
        fw={500}
        fz="xs"
        sx={{
            textTransform: 'none',
            borderRadius: '2px',
        }}
    >
        {children}
    </Mark>
);

const ErrorMessageByType: FC<{
    validationError: ValidationResponse;
}> = ({ validationError }) => {
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

    if (isTableValidationError(validationError) && validationError) {
        return <Text>{validationError.error}</Text>;
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
