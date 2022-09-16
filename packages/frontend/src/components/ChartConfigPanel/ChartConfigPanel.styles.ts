import {
    Button,
    ButtonGroup,
    Colors,
    FormGroup,
    Switch,
} from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import styled from 'styled-components';

type CustomAxisGroup = {
    disabled?: boolean;
};

export const InputWrapper = styled(FormGroup)`
    margin: 1.357em 0 0;
    & label.bp4-label {
        display: inline-flex;
        gap: 0.214em;
        color: ${Colors.DARK_GRAY1};
        font-weight: 600;
    }
`;

export const Wrapper = styled.div`
    max-width: 28.571em;
    width: 25em;
    padding: 1.429em 1.429em 2.143em;
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
    & .bp4-icon {
        margin: 2px;
    }
`;

export const AxisGroup = styled.div<CustomAxisGroup>`
    margin-top: 1.286em;

    ${({ disabled }) =>
        disabled &&
        `
        opacity: 0.4;
        pointer-events: none;
    `}
`;

export const BlockTooltip = styled(Tooltip2)`
    display: block !important;
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

    .bp4-input-group .bp4-input {
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

export const StackingWrapper = styled(ButtonGroup)`
    padding: 0.357em 0;
    display: grid !important;
    grid-template-columns: 1fr 1fr;

    .bp4-active {
        background: #4b86be !important;
        color: ${Colors.WHITE};
    }
`;

export const StackButton = styled(Button)`
    background-color: #fcfdfe !important;
    border: 0.5px solid #cdced0;
    box-shadow: none !important;
`;

export const MinMaxContainer = styled.div`
    margin-top: 10px;
`;

export const MinMaxWrapper = styled.div`
    display: grid;
    grid-template-columns: auto auto;
    gap: 30px;
`;

export const MinMaxInput = styled(InputWrapper)`
    margin-top: 0;
`;

export const AutoRangeSwitch = styled(Switch)`
    width: fit-content !important;
`;

export const GridSettings = styled.div`
    display: flex;
    flex-direction: row;

    .bp4-label {
        margin-right: 5px;
    }
`;

export const SectionTitle = styled.p`
    color: ${Colors.DARK_GRAY1};
    font-weight: 600;
    margin: 5px 0;
`;
