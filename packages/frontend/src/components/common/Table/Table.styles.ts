import { HTMLTable } from '@blueprintjs/core';
import styled from 'styled-components';

export const TableContainer = styled.div`
    flex: 1;
    overflow: auto;
`;

export const Table = styled(HTMLTable)`
    width: 100%;
    border-left: 1px solid #dcdcdd;
    border-right: 1px solid #dcdcdd;

    thead {
        position: sticky;
        top: 0;
        inset-block-start: 0; /* "top" */

        th:first-child {
            border-top: none !important;
            border-bottom: none !important;
            box-shadow: inset 0 1px 0 #dcdcdd, inset 0 -1px 0 #dcdcdd !important;
        }

        th {
            border-top: none !important;
            border-bottom: none !important;
            box-shadow: inset 0 1px 0 #dcdcdd, inset 0 -1px 0 #b6bdca,
                inset 1px 0 0 0 rgb(17 20 24 / 15%) !important;
        }
    }

    tbody tr:first-child {
        td:first-child {
            box-shadow: none !important;
        }

        td {
            box-shadow: inset 1px 0 0 0 rgb(17 20 24 / 15%) !important;
        }
    }

    tfoot {
        position: sticky;
        bottom: 40px;
        inset-block-end: 40px; /* "bottom" */

        th:first-child {
            border-top: none !important;
            border-bottom: none !important;
            box-shadow: inset 0 1px 0 #dcdcdd, inset 0 -1px 0 #dcdcdd !important;
        }

        th {
            border-top: none !important;
            border-bottom: none !important;
            box-shadow: inset 0 1px 0 #dcdcdd, inset 0 -1px 0 #dcdcdd,
                inset 1px 0 0 0 rgb(17 20 24 / 15%) !important;
        }
    }
`;

export const TableFooter = styled.div`
    height: 40px;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding-top: 10px;
    position: sticky;
    bottom: 0;
    inset-block-end: 0; /* "bottom" */
    background: #fff;
`;
