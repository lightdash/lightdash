import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

interface BigNumberContainerProps {
    $paddingBottom?: number;
}

export const BigNumberContainer = styled.div<BigNumberContainerProps>`
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;

    padding-bottom: ${({ $paddingBottom }) =>
        $paddingBottom ? `${$paddingBottom}px` : '0px'};
`;

export const BigNumberHalf = styled.div`
    flex-shrink: 1;
    display: flex;
`;

interface BigNumberProps extends React.HTMLAttributes<HTMLDivElement> {
    $interactive?: boolean;
    $fontSize?: number;
}

export const BigNumber = styled.span<BigNumberProps>`
    color: ${Colors.DARK_GRAY4};
    text-align: center;
    font-weight: 500;
    transition: font-size 0.1s ease-in-out;
    font-size: ${({ $fontSize }) => ($fontSize ? `${$fontSize}px` : '32px')};
    ${({ $interactive }) => ($interactive ? 'cursor: pointer;' : '')}
`;

interface BigNumberLabelProps {
    $fontSize?: number;
}

export const BigNumberLabel = styled.span<BigNumberLabelProps>`
    color: ${Colors.GRAY3};
    text-align: center;
    font-weight: 500;
    transition: font-size 0.1s ease-in-out;
    font-size: ${({ $fontSize }) => ($fontSize ? `${$fontSize}px` : '16px')};
`;
