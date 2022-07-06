import { HTMLTable } from '@blueprintjs/core';
import styled from 'styled-components';

export const TableContainer = styled.div`
    flex: 1;
    overflow: auto;
`;

export const Table = styled(HTMLTable)`
    width: 100%;

    thead {
        position: sticky;
        top: 0;
        inset-block-start: 0; /* "top" */
        background: #eee;
    }

    tfoot {
        position: sticky;
        bottom: 40px;
        inset-block-end: 40px; /* "bottom" */
        background: #eee;
    }
`;

export const TableFooter = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding-top: 0.714em;
    position: sticky;
    bottom: 0;
    inset-block-end: 0; /* "bottom" */
    background: #fff;
`;
