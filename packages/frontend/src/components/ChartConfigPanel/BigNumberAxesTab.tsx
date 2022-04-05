import { InputGroup } from '@blueprintjs/core';
import {
    CompiledDimension,
    CompleteEChartsConfig,
    getItemLabel,
    Metric,
    TableCalculation,
} from 'common';
import React, { FC } from 'react';
import { InputWrapper } from './ChartConfigPanel.styles';

interface Props {
    bigNumberConfig: Partial<Partial<CompleteEChartsConfig>> | undefined;
    bigNumberLabel: CompiledDimension | Metric | TableCalculation | undefined;
    setName: (name: string) => void;
}

const BigNumberAxesTab: FC<Props> = ({
    bigNumberConfig,
    bigNumberLabel,
    setName,
}) => (
    <>
        <InputWrapper label="Label">
            <InputGroup
                placeholder="Enter label"
                defaultValue={
                    bigNumberConfig?.xAxis?.[0]?.name ||
                    (bigNumberLabel && getItemLabel(bigNumberLabel))
                }
                onBlur={(e) => setName(e.currentTarget.value)}
            />
        </InputWrapper>
    </>
);
export default BigNumberAxesTab;
