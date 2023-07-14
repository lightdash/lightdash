import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

const ConditionalFormattingGroupHeader = styled.div`
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

export const ConditionalFormattingRuleWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;
