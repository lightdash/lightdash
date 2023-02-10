import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import AutoFitText from '../AutoFitText/index';

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

export const AutoFitBigNumber = styled(AutoFitText)`
    display: flex;
    justify-content: center;
    align-items: flex-end;
`;

export const BigNumber = styled.span<BigNumberProps>`
    ${({ $interactive }) => ($interactive ? 'cursor: pointer;' : '')}
    font-weight: 500;
    color: ${Colors.DARK_GRAY4};
`;

export const AutoFitBigNumberLabel = styled(AutoFitText)`
    display: flex;
    justify-content: center;
    align-items: flex-start;
`;
export const BigNumberLabel = styled.span`
    text-align: center;
    color: ${Colors.GRAY3};
    font-weight: 500;
`;
