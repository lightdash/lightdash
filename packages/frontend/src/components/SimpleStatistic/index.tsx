import { ApiQueryResults } from 'common';
import React, { FC } from 'react';
import bigNumberConfig from '../../utils/bigNumberConfig';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
    SimpleStatisticsWrapper,
} from './SimpleStatistics.styles';

interface Props {
    data: ApiQueryResults | undefined;
    label: string;
}

const SimpleStatistic: FC<Props> = ({ data, label }) => {
    const bigNumber = bigNumberConfig(data);
    return (
        <SimpleStatisticsWrapper>
            <BigNumberContainer>
                <BigNumberLabel>{label}</BigNumberLabel>
                <BigNumber>{bigNumber}</BigNumber>
            </BigNumberContainer>
        </SimpleStatisticsWrapper>
    );
};

export default SimpleStatistic;
