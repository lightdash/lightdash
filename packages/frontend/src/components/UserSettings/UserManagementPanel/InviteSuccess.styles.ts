import { Callout } from '@blueprintjs/core';
import styled from 'styled-components';

export const InviteSuccessCallout = styled(Callout)<{
    $hasMarginTop?: boolean;
}>`
    ${({ $hasMarginTop }) => $hasMarginTop && 'margin-top: 10px;'}
`;

export const MessageWrapper = styled.div`
    display: inline-flex;
    width: 100%;
    margin-bottom: 5px;
    align-items: flex-start;

    p {
        flex: 1;
        margin: 0;
    }
`;
