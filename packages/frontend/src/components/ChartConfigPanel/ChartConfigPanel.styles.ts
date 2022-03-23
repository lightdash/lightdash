import { FormGroup } from '@blueprintjs/core';
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
    padding: 1em;
`;
export const AxisTitle = styled.p`
    color: rgba(61, 73, 83, 0.8);
    font-weight: 600;
`;
export const AxisFieldDropdown = styled.div``;
