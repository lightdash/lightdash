import { ButtonGroup, Switch } from '@blueprintjs/core';
import styled from 'styled-components';
import { StyledFormGroup } from '../VisualizationConfigPanel.styles';

export const FieldsGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 1.286em;
    align-items: center;
`;

export const GridFieldLabel = styled.span`
    display: inline-flex;
    gap: 0.357em;
    & .bp4-icon {
        margin: 2px;
    }
`;

export const EquallySizedButtonGroup = styled(ButtonGroup)`
    display: grid !important;
    grid-template-columns: 1fr 1fr;
`;

export const MinMaxContainer = styled.div`
    margin-top: 10px;
`;

export const MinMaxWrapper = styled.div`
    display: grid;
    grid-template-columns: auto auto;
    gap: 30px;
`;

export const StyledMinMaxFormGroup = styled(StyledFormGroup)`
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
