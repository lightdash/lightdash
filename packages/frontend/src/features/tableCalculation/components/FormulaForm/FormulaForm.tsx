import {
    type Explore,
    type GeneratedFormulaTableCalculation,
    type MetricQuery,
} from '@lightdash/common';
import { Anchor, Box, Flex, Group, Text } from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
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
        <Flex direction="column" h="100%">
            <Box
                className={`${classes.container} ${error ? classes.containerError : ''}`}
            >
                <Box className={classes.editorArea}>
                    <FormulaEditor
                        explore={explore}
                        metricQuery={metricQuery}
                        initialContent={initialFormula}
                        onTextChange={onChange}
                        onBlur={validate}
                        isFullScreen={isFullScreen}
                    />
                </Box>
                {isAmbientAiEnabled && onAiApply ? (
                    <AiFormulaTableCalculationInput
                        currentFormula={formula || undefined}
                        onApply={onAiApply}
                    />
                ) : (
                    <Group gap={6} wrap="nowrap" className={classes.helpHint}>
                        <MantineIcon
                            icon={IconInfoCircle}
                            color="var(--mantine-color-dimmed)"
                            size="sm"
                        />
                        <Text fz="xs" c="dimmed">
                            New to formulas?{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/guides/formula-table-calculations"
                                rel="noreferrer"
                                fz="xs"
                                c="dimmed"
                                underline="always"
                            >
                                Check out the formula guide
                            </Anchor>
                        </Text>
                    </Group>
                )}
            </Box>
            {error && <Text className={classes.errorText}>{error}</Text>}
        </Flex>
    );
};
