import { type Explore, type MetricQuery } from '@lightdash/common';
import type { FC } from 'react';
import { FormulaEditor } from './FormulaEditor';

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    initialFormula?: string;
    onChange: (formula: string) => void;
    isFullScreen?: boolean;
};

export const FormulaForm: FC<Props> = ({
    explore,
    metricQuery,
    initialFormula,
    onChange,
    isFullScreen,
}) => (
    <FormulaEditor
        explore={explore}
        metricQuery={metricQuery}
        initialContent={initialFormula}
        onTextChange={onChange}
        isFullScreen={isFullScreen}
    />
);
