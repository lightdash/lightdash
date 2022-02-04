import { Button, Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const FilterModalContainer = styled.div``;

export const Title = styled.p`
    font-weight: bold;
`;

export const SearchWrapper = styled.div`
    width: 20.5em;
    margin: 0.643em 0 0;
    & input {
        border-radius: 0.214em 0.214em 0 0;
    }
`;

export const InputWrapper = styled.div`
    width: 20.5em;
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
    max-height: 9.857em;
    overflow-y: scroll;
    border-bottom: 0.071em solid #cccecf;
    border-left: 0.071em solid #cccecf;
    border-right: 0.071em solid #cccecf;
`;

export const DimensionLabel = styled(Button)`
    margin: 0;
    width: 100%;
    border-radius: 0;

    span {
        width: 100%;
        text-align: left;
    }

    :active,
    :focus {
        outline: none;
    }
`;

export const DimensionItem = styled.li`
    list-style: none;

    :hover {
        ${DimensionLabel} {
            background: ${Colors.BLUE3};
            color: ${Colors.WHITE};
        }
    }
`;
