import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const SimpleStatisticsWrapper = styled.div`
    width: 100%;
    height: 100%;
    position: relative;
`;

export const BigNumberContainer = styled.div`
    border: 1px solid ${Colors.GRAY4};
    border-radius: 8px;
    max-width: fit-content;
    padding: 30px 40px;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
`;

export const BigNumber = styled.div`
    font-size: 42px;
    font-weight: 500;
    color: ${Colors.DARK_GRAY5};
`;

export const BigNumberLabel = styled.h2`
    text-align: center;
    color: ${Colors.GRAY3};
    font-weight: normal;
    font-size: 16px;
    margin: 0;
`;
