import { Button, Colors, HTMLSelect } from '@blueprintjs/core';
import styled from 'styled-components';

export const Title = styled.p`
    font-weight: bold;
`;

export const InputWrapper = styled.div`
    width: 20.5em;
    margin: 0.643em 0 0;
    & input {
        border-radius: 3px 3px 0 0;
    }
`;

export const SelectField = styled(HTMLSelect)`
    width: 100%;
`;

export const FilterFooter = styled.p`
    color: ${Colors.GRAY2};
    font-weight: 500;
    font-size: 0.857em;
    margin: 0;
`;

export const DimensionsContainer = styled.ul`
    padding: 0;
    margin: 0 0 2.5em;
    max-height: 138px;
    overflow-y: scroll;
    border-bottom: 1px solid #cccecf;
    border-left: 1px solid #cccecf;
    border-right: 1px solid #cccecf;
`;

export const DimensionItem = styled.li`
    list-style: none;
`;

export const DimensionLabel = styled(Button)`
    margin: 0;
    width: 100%;
    border-radius: 0;

    span {
        width: 100%;
        text-align: left;
    }

    :hover {
        background: ${Colors.GRAY4};
    }

    :active,
    :focus {
        background: ${Colors.BLUE3};
        color: ${Colors.WHITE};
        outline: none;
    }
`;
