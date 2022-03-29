import { Button, Colors, FormGroup } from '@blueprintjs/core';
import styled from 'styled-components';

export const InputWrapper = styled(FormGroup)`
    & label.bp3-label {
        font-weight: 500;
        display: inline-flex;
        gap: 0.214em;
    }
`;

export const Wrapper = styled.div`
    max-width: 28.571em;
    min-width: 25em;
    padding: 1.429em;
`;

export const FieldsGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 1.286em;
    align-items: center;
`;

export const GridLabel = styled.span`
    font-size: 14px;
    line-height: 1.286em;
    font-weight: 600;
`;

export const GridFieldLabel = styled.span`
    display: inline-flex;
    gap: 0.357em;
    & .bp3-icon {
        margin: 2px;
    }
`;

export const AxisGroup = styled.div`
    padding-bottom: 1.286em;
`;
export const AxisTitleWrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
`;
export const AxisTitle = styled.p`
    color: ${Colors.DARK_GRAY1};
    margin: 0;
    font-weight: 600;
`;
export const AxisFieldDropdown = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 0.357em 0;

    .bp3-input-group .bp3-input {
        border: 0.7px solid ${Colors.LIGHT_GRAY1};
        box-sizing: border-box;
        box-shadow: inset 0px 1px 1px rgba(16, 22, 26, 0.2);
    }
`;

export const DeleteFieldButton = styled(Button)`
    border: 0.05em solid ${Colors.LIGHT_GRAY1} !important;
    box-sizing: border-box;
    box-shadow: inset 0px 1px 1px rgba(16, 22, 26, 0.2) !important;
    margin-left: 5px;

    span > svg:not([fill]) {
        width: 13px;
        height: 13px;
        fill: ${Colors.GRAY1};
    }
`;
