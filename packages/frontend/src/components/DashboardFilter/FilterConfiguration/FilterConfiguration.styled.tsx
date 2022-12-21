import { Button } from '@blueprintjs/core';
import styled from 'styled-components';

export const ConfigureFilterWrapper = styled.div`
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 15px;
`;

export const FieldLabelAndIconWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

export const ActionsWrapper = styled.div`
    display: flex;
    justify-content: space-between;
`;

export const ApplyButton = styled(Button)`
    margin-left: auto;
`;
