import {
    type ApiError,
    type GeneratedFormulaTableCalculation,
} from '@lightdash/common';
import { Box, Skeleton, Text } from '@mantine-8/core';
import { type FC } from 'react';
import classes from './FormulaConversionPreview.module.css';

type Props = {
    isLoading: boolean;
    error: ApiError | null;
    result: GeneratedFormulaTableCalculation | null;
};

/**
 * Renders the body content (formulaBox containing formula text, skeleton,
 * or error message) of the SQL→formula conversion preview. The outer
 * container + header live in `AiSlot`, which the consumer is expected
 * to provide.
 */
const FormulaConversionPreviewBody: FC<Props> = ({
    isLoading,
    error,
    result,
}) => {
    if (error) {
        return (
            <Box className={classes.formulaBox}>
                <Text size="xs" c="red">
                    {error.error?.message ??
                        'Something went wrong. Try again or write the formula yourself.'}
                </Text>
            </Box>
        );
    }

    if (isLoading) {
        return (
            <Box className={classes.formulaBox}>
                <Skeleton height={10} width="85%" radius="sm" />
                <Skeleton height={10} width="60%" radius="sm" mt={6} />
            </Box>
        );
    }

    if (!result) return null;

    return (
        <Box className={classes.formulaBox}>
            <span className={classes.equalsPrefix}>=</span>
            {result.formula}
        </Box>
    );
};

export default FormulaConversionPreviewBody;
