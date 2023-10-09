import { Button } from '@blueprintjs/core';
import styled from 'styled-components';

export const SaveButton = styled(Button)<{ $isLargeButton?: boolean }>`
    width: 131px;
    height: 30px;

    ${({ $isLargeButton }) =>
        $isLargeButton &&
        `
        width: 122px;
        height: 40px;
        margin-left: 12px !important;
    `}
`;
