import { Button, Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const ConditionalFormattingListWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap 10px;

    // .bp4-form-group:last-child {
    //     margin: 0;
    // }

    .bp4-form-group {
        margin: 0;
    }
`;

export const ConditionalFormattingWrapper = styled.div``;

export const ConditionalFormattingConfigWrapper = styled.div`
    padding: 8px 10px;
    background-color: ${Colors.LIGHT_GRAY5};
    border-radius: 5px;
`;

export const ConditionalFormattingGroupHeader = styled.div`
    display: flex;
    align-items: center;
`;

export const ConditionalFormattingRuleGroupHeader = styled(
    ConditionalFormattingGroupHeader,
)``;

export const ConditionalFormattingGroupTitle = styled.div`
    font-size: 13px;
    color: ${Colors.DARK_GRAY3};
    font-weight: 600;
`;

export const ConditionalFormattingRuleAndLabel = styled.div`
    padding: 0 10px;
    font-size: 11px;
    color: ${Colors.DARK_GRAY5};
    font-weight: 600;
`;

export const ConditionalFormattingCloseButton = styled(Button)`
    margin-left: auto;
`;
