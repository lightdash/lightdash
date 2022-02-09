import { AnchorButton, Button, Colors, HTMLSelect } from '@blueprintjs/core';
import styled from 'styled-components';

export const ConfigureFilterWrapper = styled.div`
    width: 20.5em;
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const Title = styled.p`
    font-weight: bold;
`;

export const InputWrapper = styled.div`
    width: 20.5em;
`;

export const SelectField = styled(HTMLSelect)`
    width: 100% !important;
    margin-bottom: 1.714em;
    select {
        width: 100% !important;
    }
`;

export const BackButton = styled(AnchorButton)`
    color: ${Colors.BLUE3} !important;
    padding: 0;
    margin-bottom: 1.5em;
    justify-content: flex-start;
    font-weight: 600;
    :hover {
        background: transparent !important;
        span {
            text-decoration: underline;
        }
    }
    :focus {
        outline: none;
        span {
            text-decoration: underline;
        }
    }
`;

export const ApplyFilterButton = styled(Button)`
    margin: 1.714em 0 0 auto;
    justify-self: flex-end;
`;
