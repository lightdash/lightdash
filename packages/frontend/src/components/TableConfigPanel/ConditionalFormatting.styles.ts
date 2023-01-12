import { Button, Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const ConditionalFormattingListWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;

    .bp4-form-group:last-child {
        margin: 0;
    }
`;

export const ConditionalFormattingWrapper = styled.div``;

export const ConditionalFormattingConfigWrapper = styled.div`
    margin-top: 4px;
    padding: 12px 10px;
    background-color: ${Colors.LIGHT_GRAY5};
    border-radius: 5px;

    .bp4-form-group:last-child {
        margin: 0;
    }
`;

export const ConditionalFormattingRuleListWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;

    .bp4-form-group:last-child {
        margin: 0;
    }
`;

export const ConditionalFormattingRuleHeader = styled.div`
    display: flex;
    gap: 6px;
    align-items: center;
`;

export const ConditionalFormattingRuleWrapper = styled.div`
    padding: 12px 10px;
    background-color: ${Colors.LIGHT_GRAY4};
    border-radius: 3px;

    .bp4-form-group:last-child {
        margin: 0;
    }
`;

export const ConditionalFormattingRuleAndLabel = styled.div`
    font-size: 11px;
    color: ${Colors.DARK_GRAY5};
    font-weight: 600;
`;

export const ConditionalFormattingCloseButton = styled(Button)`
    margin-left: auto;
`;
