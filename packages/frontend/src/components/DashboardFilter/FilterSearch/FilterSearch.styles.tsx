import { Colors } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import styled from 'styled-components';

interface FilterModalContainerProps {
    $wide?: boolean;
}

export const FilterModalContainer = styled.div<FilterModalContainerProps>`
    padding: 20px;
    width: ${({ $wide }) => ($wide ? '500px' : '350px')};
`;

export const TileContainer = styled.div`
    width: 500px;
`;

export const InputWrapper = styled.div`
    width: 20.5em;
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
