import { Callout, H5 } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import styled from 'styled-components';

export const Title = styled(H5)`
    padding-left: 10px;
`;

export const SideBarWrapper = styled.div`
    overflow-y: auto;
`;

export const ContentContainer = styled.div`
    padding: 10px 20px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 100vw;
`;

export const MissingTablesInfo = styled(Tooltip2)`
    width: 100%;
`;

export const ButtonsWrapper = styled.div`
    height: 60px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    button {
        margin: 0;
    }
`;

export const SqlCallout = styled(Callout)`
    margin-top: 20px;
`;
