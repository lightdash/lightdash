import { Card, Colors, H3 } from '@blueprintjs/core';
import styled from 'styled-components';
import { BigButton } from '../common/BigButton';

export const CardWrapper = styled(Card)`
    padding: 30px 27px;
    display: flex;
    flex-direction: row;
    margin-bottom: 20px;
`;

export const Title = styled(H3)`
    text-align: center;
    margin-bottom: 25px;
`;

export const SaveButton = styled(BigButton)`
    width: 170px;
    float: right;
`;

export const TextP = styled.p`
    color: ${Colors.GRAY1};
`;

export const LeftPanel = styled.div`
    flex: 1;
    width: 50%;
    padding-right: 20px;
`;

export const RightPanel = styled.div`
    flex: 1;
    width: 50%;
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
