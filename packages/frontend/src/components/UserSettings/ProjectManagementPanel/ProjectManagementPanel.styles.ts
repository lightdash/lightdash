import { Card, Tag } from '@blueprintjs/core';
import styled from 'styled-components';

export const ProjectManagementPanelWrapper = styled.div`
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const HeaderActions = styled.div`
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

export const ProjectListItemWrapper = styled(Card)`
    display: flex;
    flex-direction: column;
    margin-bottom: 1.25em;
    width: 100%;
`;

export const ItemContent = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

export const ProjectInfo = styled.div`
    margin: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
`;

export const ProjectName = styled.b`
    margin: 0;
    margin-right: 0.625em;
`;

export const ProjectTag = styled(Tag)`
    width: fit-content;
    margin-top: 0.3em;
`;
