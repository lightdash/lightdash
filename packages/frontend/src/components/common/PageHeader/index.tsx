import styled from 'styled-components';

export const PageTitleAndDetailsContainer = styled.div`
    flex: 1;
`;

export const InfoContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;

    color: #868e96;
    font-size: 12px;
    line-height: 14px;

    svg: {
        stroke: #868e96 !important;
    }
`;

export const PageActionsContainer = styled.div`
    display: flex;
    > *:not(:last-child) {
        margin-right: 10px;
    }
`;
