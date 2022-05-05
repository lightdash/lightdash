import { Dialog } from '@blueprintjs/core';
import styled, { css } from 'styled-components';
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

    .bp4-switch {
        margin: 0;
    }
`;

export const DialogBody = styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
`;

export const TableCalculationSqlInputWrapper = styled.div<{
    $isFullScreen: boolean;
}>`
    flex: 1;
    display: flex;
    flex-direction: column;

    .bp4-form-group {
        flex: 1;

        .bp4-form-content {
            flex: 1;
            min-height: 100px;

            ${({ $isFullScreen }) =>
                $isFullScreen
                    ? css`
                          .ace_editor {
                              height: 100% !important;
                          }
                      `
                    : css`
                          .ace_editor {
                              min-height: 100%;
                          }
                      `}
        }
    }
`;
