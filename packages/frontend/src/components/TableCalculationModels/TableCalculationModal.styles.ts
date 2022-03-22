import { Dialog } from '@blueprintjs/core';
import styled from 'styled-components';
import Form from '../ReactHookForm/Form';

export const FlexForm = styled(Form)`
    display: flex;
    flex: 1;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
`;

export const TableCalculationDialog = styled(Dialog)`
    width: 700px;
`;

export const DialogButtons = styled.div`
    align-items: center;

    .bp3-switch {
        margin: 0;
    }
`;

export const DialogBody = styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
`;

export const TableCalculationSqlInputWrapper = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;

    .bp3-form-group {
        flex: 1;

        .bp3-form-content {
            flex: 1;
            min-height: 100px;

            .ace_editor {
                min-height: 100px;
            }
        }
    }
`;
