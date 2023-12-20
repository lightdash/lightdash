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

// FIXME: colors in this file are hardcoded to mantine values.
// #373a40 is dark.4, #868E96 is gray.6
export const BigNumber = styled.span<BigNumberProps>`
    color: #373a40;
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
    color: #868e96;
    text-align: center;
    font-weight: 500;
    transition: font-size 0.1s ease-in-out;
    font-size: ${({ $fontSize }) => ($fontSize ? `${$fontSize}px` : '16px')};
`;
