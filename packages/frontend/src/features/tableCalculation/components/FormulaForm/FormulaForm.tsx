import {
    type Explore,
    type GeneratedFormulaTableCalculation,
    type MetricQuery,
} from '@lightdash/common';
import { Box, Flex, Text } from '@mantine-8/core';
import { useEffect, type FC } from 'react';
import { AiFormulaTableCalculationInput } from '../../../../ee/features/ambientAi/components/tableCalculation';
import { useAmbientAiEnabled } from '../../../../ee/features/ambientAi/hooks/useAmbientAiEnabled';
import { useFormulaValidation } from '../../hooks/useFormulaValidation';
import { FormulaEditor } from './FormulaEditor';
import classes from './FormulaForm.module.css';

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    formula: string;
    initialFormula?: string;
    onChange: (formula: string) => void;
    onValidationChange: (error: string | null) => void;
    onAiApply?: (result: GeneratedFormulaTableCalculation) => void;
    isFullScreen?: boolean;
};

export const FormulaForm: FC<Props> = ({
    explore,
    metricQuery,
    formula,
    initialFormula,
    onChange,
    onValidationChange,
    onAiApply,
    isFullScreen,
}) => {
    const { error, validate } = useFormulaValidation(formula, metricQuery);
    const isAmbientAiEnabled = useAmbientAiEnabled();

    useEffect(() => {
        onValidationChange(error);
    }, [error, onValidationChange]);

    return (
        <Flex
            direction="column"
            h="100%"
            gap="xxs"
            className={classes.container}
        >
            <Box
                flex={1}
                className={`${classes.editorFrame} ${error ? classes.editorFrameError : ''}`}
            >
                <FormulaEditor
                    explore={explore}
                    metricQuery={metricQuery}
                    initialContent={initialFormula}
                    onTextChange={onChange}
                    onBlur={validate}
                    isFullScreen={isFullScreen}
                />
            </Box>
            {error && <Text className={classes.errorText}>{error}</Text>}
            {isAmbientAiEnabled && onAiApply && (
                <AiFormulaTableCalculationInput
                    currentFormula={formula || undefined}
                    onApply={onAiApply}
                />
            )}
        </Flex>
    );
};
