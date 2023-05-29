import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import { BigButton } from '../common/BigButton';

export const SaveButton = styled(BigButton)`
    width: 170px;
    float: right;
`;

export const TextP = styled.p`
    color: ${Colors.GRAY1};
`;

export const ListTrigger = styled.b`
    cursor: pointer;
`;

export const ListWrapper = styled.div`
    padding: 10px;
    color: ${Colors.GRAY1};
    max-height: 270px;
    overflow-y: auto;
    overflow-x: hidden;
`;
