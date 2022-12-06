import { Button } from '@blueprintjs/core';
import styled from 'styled-components';

export const ConfigureFilterWrapper = styled.div`
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 15px;
`;

export const Title = styled.div`
    font-weight: 600;
    margin-bottom: 10px;
`;

export const InputsWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

export const ActionsWrapper = styled.div`
    display: flex;
    justify-content: space-between;
`;

export const ApplyButton = styled(Button)`
    margin-left: auto;
`;

export const TabWrapper = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;

    .bp4-tabs {
        .bp4-tab {
            line-height: unset;
        }

        .bp4-tab-indicator {
            height: 2px !important;
            bottom: -2px !important;
        }
    }
`;
