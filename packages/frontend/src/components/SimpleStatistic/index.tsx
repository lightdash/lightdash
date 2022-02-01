import { ApiQueryResults } from 'common';
import React, { FC } from 'react';
import useBigNumberConfig from '../../hooks/useBigNumberConfig';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
    SimpleStatisticsWrapper,
} from './SimpleStatistics.styles';

interface Props {
    data: ApiQueryResults | undefined;
}

const SimpleStatistic: FC<Props> = ({ data }) => {
    const { bigNumber, bigNumberLabel } = useBigNumberConfig(data);
    return (
        <SimpleStatisticsWrapper>
            <BigNumberContainer>
                <BigNumberLabel>{bigNumberLabel}</BigNumberLabel>
                <BigNumber>{bigNumber}</BigNumber>
            </BigNumberContainer>
        </SimpleStatisticsWrapper>
    );
};

export default SimpleStatistic;
