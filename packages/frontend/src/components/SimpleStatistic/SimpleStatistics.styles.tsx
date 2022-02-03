import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const SimpleStatisticsWrapper = styled.div`
    width: 100%;
    height: 100%;
    position: relative;
`;

export const BigNumberContainer = styled.div`
    border: 1px solid ${Colors.GRAY4};
    border-radius: 0.5em;
    box-shadow: -0.375em 0.5em 0.313em -0.25em rgba(0, 0, 0, 0.06);
    max-width: fit-content;
    padding: 1.875em 2.5em;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
`;

export const BigNumber = styled.div`
    font-size: 2.625em;
    font-weight: 500;
    color: ${Colors.DARK_GRAY5};
`;

export const BigNumberLabel = styled.h2`
    text-align: center;
    color: ${Colors.GRAY3};
    font-weight: normal;
    font-size: 1em;
    margin: 0;
`;
