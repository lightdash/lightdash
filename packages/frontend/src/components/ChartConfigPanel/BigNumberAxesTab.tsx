import { InputGroup } from '@blueprintjs/core';
import { CompleteEChartsConfig, friendlyName } from 'common';
import React, { FC } from 'react';
import { InputWrapper } from './ChartConfigPanel.styles';

interface Props {
    bigNumberConfig: Partial<Partial<CompleteEChartsConfig>> | undefined;
    bigNumberLabel: string | undefined;
    setName: (name: string) => void;
}

const BigNumberAxesTab: FC<Props> = ({
    bigNumberConfig,
    bigNumberLabel,
    setName,
}) => {
    const defaultValue =
        bigNumberConfig?.yAxis?.[0]?.name &&
        friendlyName(bigNumberConfig?.yAxis?.[0]?.name);

    return (
        <>
            <InputWrapper label="Label">
                <InputGroup
                    placeholder="Enter label"
                    defaultValue={defaultValue || bigNumberLabel}
                    onBlur={(e) => setName(e.currentTarget.value)}
                />
            </InputWrapper>
        </>
    );
};
export default BigNumberAxesTab;
