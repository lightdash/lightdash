import { Colors, H4, Icon } from '@blueprintjs/core';
import styled from 'styled-components';

const statusInfo = (status: string) => {
    switch (status) {
        case 'DONE':
            return {
                background: 'rgba(15, 153, 96, 0.15)',
                color: Colors.GREEN2,
            };
        case 'ERROR':
            return {
                background: '#FAE1E1',
                color: Colors.RED2,
            };
        default:
            return {
                background: 'rgb(138, 155, 168, 0.15)',
                color: Colors.GRAY3,
            };
    }
};

export const RefreshStepsHeadingWrapper = styled.div`
    display: grid;
    grid-template-columns: 18px auto;
    column-gap: 15px;
    align-items: flex-start;
    margin: 13px 0;
    padding: 0;
    box-shadow: none;

    .bp4-icon {
        padding-top: 3px !important;
        margin-left: 0;
    }
`;

export const RefreshStepsTitle = styled(H4)`
    font-weight: 600;
`;

export const StepsCompletionOverview = styled.p`
    color: ${Colors.GRAY2};
    font-size: 14px;
    font-weight: 500;
    margin: 0;
`;

export const StepsWrapper = styled.div`
    padding: 20px 22px;
`;

export const StepInfo = styled.div`
    grid-column: 2;
`;

export const Step = styled.div<{ status: string }>`
    background: ${({ status }) => statusInfo(status).background};
    border-radius: 3px;
    padding: 12px 15px;
    margin-bottom: 10px;
    display: grid;
    grid-template-columns: 15px auto;
    column-gap: 11px;
`;

export const StepName = styled.p`
    color: ${Colors.DARK_GRAY1};
    font-weight: 600;
    margin: 0;
`;

export const StepStatusWrapper = styled.p`
    margin: 0;
    font-size: 12px;
    color: ${Colors.DARK_GRAY5};
`;

export const StepStatus = styled.span<{ status: string }>`
    color: ${({ status }) => statusInfo(status).color};
    font-weight: bold;
`;

export const StepIconWrapper = styled(Icon)<{ status: string }>`
    width: 15px;
    height: 15px;
    padding-top: 2px;
    path {
        fill: ${({ status }) => statusInfo(status).color};
    }
`;

export const ErrorMessageWrapper = styled.div`
    margin-top: 10px;
    word-wrap: break-word;
    hyphens: auto;
`;
