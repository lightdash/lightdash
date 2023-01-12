import { Button, Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const ConditionalFormattingWrapper = styled.div`
    position: relative;
    padding: 12px 10px;
    background-color: ${Colors.LIGHT_GRAY5};
    border-radius: 5px;

    .bp4-form-group:last-child {
        margin: 0;
    }
`;

export const StyledCloseButton = styled(Button)`
    position: absolute;
    top: 5px;
    right: 5px;

    min-height: 20px !important;
    min-width: 20px !important;
    padding: 0 4px;

    svg {
        width: 14px;
        height: 14px;
    }
`;

export const ConditionalFormattingListWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;
