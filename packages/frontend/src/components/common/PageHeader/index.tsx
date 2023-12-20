import styled from 'styled-components';

export const PageTitleAndDetailsContainer = styled.div`
    flex: 1;
`;

// FIXME: colors in this file are hardcoded to mantine values.
// We should use the theme when we aren't using styled components.
// #868e96 is gray.6
export const PageDetailsContainer = styled.div`
    margin-top: 0.38em;
    display: flex;
    align-items: center;
    color: #868e96;
    font-size: 12px;
    font-weight: 400;
    line-height: 14px;
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

export const UpdatedInfoLabel = styled.p`
    color: #868e96;
    font-size: 12px;
    font-weight: 400;
    line-height: 14px;
    margin-bottom: 0;
`;

export const PageActionsContainer = styled.div`
    display: flex;
    > *:not(:last-child) {
        margin-right: 10px;
    }
`;
