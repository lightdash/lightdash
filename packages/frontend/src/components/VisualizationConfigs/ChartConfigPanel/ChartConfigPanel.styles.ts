import { Colors, FormGroup, Switch } from '@blueprintjs/core';
import styled from 'styled-components';

export const InputWrapper = styled(FormGroup)`
    margin: 1.357em 0 0;

    & label.bp4-label {
        display: inline-flex;
        gap: 0.214em;
        color: ${Colors.DARK_GRAY1};
        font-weight: 600;
    }
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
