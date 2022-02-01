import React, { FC } from 'react';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
    SimpleStatisticsWrapper,
} from './SimpleStatistics.styles';

interface Props {
    bigNumber: string | number;
    bigNumberLabel: string;
}

const SimpleStatistic: FC<Props> = ({ bigNumber, bigNumberLabel }) => (
    <SimpleStatisticsWrapper>
        <BigNumberContainer>
            <BigNumberLabel>{bigNumberLabel}</BigNumberLabel>
            <BigNumber>{bigNumber}</BigNumber>
        </BigNumberContainer>
    </SimpleStatisticsWrapper>
);

export default SimpleStatistic;
