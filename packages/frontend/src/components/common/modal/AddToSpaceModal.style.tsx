import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const CreateNewText = styled.p`
    font-weight: bold;
    color: ${Colors.BLUE3};
    cursor: pointer;
    margin-top: 1em;
    width: fit-content;
`;

export const SpaceLabel = styled.div`
    color: ${Colors.GRAY2};

    font-size: 12px;
    line-height: 18px;

    .bp4-icon {
        margin-right: 6px;
    }
`;
