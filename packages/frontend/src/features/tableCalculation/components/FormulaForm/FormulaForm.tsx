import { type Explore, type MetricQuery } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import { useFormulaValidation } from '../../hooks/useFormulaValidation';
import { FormulaEditor } from './FormulaEditor';

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    formula: string;
    initialFormula?: string;
    onChange: (formula: string) => void;
    onValidationChange: (error: string | null) => void;
    isFullScreen?: boolean;
};

export const FormulaForm: FC<Props> = ({
    explore,
    metricQuery,
    formula,
    initialFormula,
    onChange,
    onValidationChange,
    isFullScreen,
}) => {
    const { error, validate } = useFormulaValidation(formula, metricQuery);

    useEffect(() => {
        onValidationChange(error);
    }, [error, onValidationChange]);

    return (
        <FormulaEditor
            explore={explore}
            metricQuery={metricQuery}
            initialContent={initialFormula}
            onTextChange={onChange}
            onBlur={validate}
            parseError={error}
            isFullScreen={isFullScreen}
        />
    );
};
