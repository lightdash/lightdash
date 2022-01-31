import React, { FC } from 'react';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
    SimpleStatisticsWrapper,
} from './SimpleStatistics';

interface Props {
    data: any;
}

const SimpleStatistic: FC<Props> = ({ data }) => {
    const getBigNumber = data;
    console.log(getBigNumber);

    return (
        <SimpleStatisticsWrapper>
            <BigNumberContainer>
                <BigNumberLabel>Unique order count</BigNumberLabel>
                <BigNumber>{6.18}</BigNumber>
            </BigNumberContainer>
        </SimpleStatisticsWrapper>
    );
};

export default SimpleStatistic;
