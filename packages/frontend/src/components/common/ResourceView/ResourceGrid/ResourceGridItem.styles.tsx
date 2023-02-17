import { Colors, Icon, IconName, Text } from '@blueprintjs/core';
import { FC } from 'react';
import styled from 'styled-components';
import LinkButton from '../../LinkButton';

export const ResourceGridItemLink = styled(LinkButton)`
    padding: 10px;
    border: 1px solid ${Colors.LIGHT_GRAY3} !important;

    .bp4-button-text {
        width: 100%;
        text-align: left;
    }
`;

export const ResourceGridItemWrapper = styled.div`
    padding: 12px 20px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 20px;
`;

export const ResourceGridItemTitle = styled(Text)`
    font-weight: 600;
    text-align: left;
    margin-top: 5px;
    margin-bottom: 10px;
`;

export const ResourceGridItemCountWrapper = styled.span`
    display: flex;
    align-items: center;
`;

export const ResourceGridItemCountIcon = styled(Icon)`
    margin-right: 5px;
`;

export const ResourceGridItemCountText = styled(Text)`
    color: ${Colors.GRAY3};
    font-size: 12px;
    font-weight: 600;
    margin-right: 10px;
`;

export const ResourceGridItemHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

export const ResourceGridItemFooter = styled.div`
    display: flex;
`;

export const ResourceGridItemCount: FC<{ icon: IconName; value: number }> = ({
    icon,
    value,
}) => {
    return (
        <ResourceGridItemCountWrapper>
            <ResourceGridItemCountIcon
                icon={icon}
                size={12}
                color={Colors.GRAY3}
            />
            <ResourceGridItemCountText>{value}</ResourceGridItemCountText>
        </ResourceGridItemCountWrapper>
    );
};
