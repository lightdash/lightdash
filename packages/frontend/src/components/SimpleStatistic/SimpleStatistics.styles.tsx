import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const BigNumberContainer = styled.div`
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
`;

interface BigNumberProps extends React.HTMLAttributes<HTMLDivElement> {
    $interactive?: boolean;
}

export const BigNumber = styled.div<BigNumberProps>`
    ${({ $interactive }) => ($interactive ? 'cursor: pointer;' : '')}
    font-weight: 500;
    color: ${Colors.DARK_GRAY4};
    text-align: center;
`;

export const BigNumberLabel = styled.h2`
    text-align: center;
    color: ${Colors.GRAY3};
    font-weight: 500;
    margin: 0;
`;
