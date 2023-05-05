import { Card, H5, Tag } from '@blueprintjs/core';
import styled from 'styled-components';

export const HeaderActions = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
`;

export const AccessTokenWrapper = styled(Card)`
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

export const AccessTokenInfo = styled.div`
    margin: 0;
    flex: 1;
    display: flex;
    gap: 3px;
    flex-direction: column;
`;

export const AccessTokenLabel = styled.b`
    margin: 0;
    margin-right: 0.625em;
`;

export const ExpireAtLabel = styled(Tag)`
    width: fit-content;
`;

export const PanelTitle = styled(H5)`
    margin: 0;
`;
