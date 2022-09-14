import { Colors, Icon, IconName, Text } from '@blueprintjs/core';
import React, { FC } from 'react';
import styled from 'styled-components';
import LinkButton from '../../common/LinkButton';

export const SpaceLinkButton = styled(LinkButton)`
    padding: 10px;
    border: 1px solid ${Colors.LIGHT_GRAY3} !important;

    .bp4-button-text {
        width: 100%;
        text-align: left;
    }
`;

export const SpaceListWrapper = styled.div`
    padding: 12px 20px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 2em 1.5em;
`;

export const SpaceTitle = styled(Text)`
    font-weight: 600;
    text-align: left;
    margin-top: 5px;
    margin-bottom: 10px;
`;

export const CountWrapper = styled.span`
    display: flex;
    align-items: center;
`;

export const CountIcon = styled(Icon)`
    margin-right: 5px;
`;

export const CountText = styled(Text)`
    color: ${Colors.GRAY3};
    font-size: 12px;
    font-weight: 600;
    margin-right: 10px;
`;

export const SpaceHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

export const SpaceFooter = styled.div`
    display: flex;
`;

export const SpaceItemCount: FC<{ icon: IconName; value: number }> = ({
    icon,
    value,
}) => {
    return (
        <CountWrapper>
            <CountIcon icon={icon} size={12} color={Colors.GRAY3} />
            <CountText>{value}</CountText>
        </CountWrapper>
    );
};
