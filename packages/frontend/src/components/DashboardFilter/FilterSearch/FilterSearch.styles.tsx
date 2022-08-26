import { Colors } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import styled from 'styled-components';

export const FilterModalContainer = styled.div``;

export const Title = styled.p`
    font-weight: bold;
`;

export const InputWrapper = styled.div`
    width: 20.5em;
`;

export const FilterFooter = styled.p`
    color: ${Colors.GRAY2};
    font-weight: 500;
    font-size: 0.857em;
    margin: 2.5em 0 0;
`;

export const DimensionLabel = styled(MenuItem2)`
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

export const DimensionItem = styled.span`
    :hover {
        ${DimensionLabel} {
            background: ${Colors.BLUE3};
            color: ${Colors.WHITE};
        }
    }
`;
