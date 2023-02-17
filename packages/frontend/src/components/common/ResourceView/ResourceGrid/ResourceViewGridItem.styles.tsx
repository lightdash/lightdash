import { Colors, Icon, IconName, Text } from '@blueprintjs/core';
import { FC } from 'react';
import styled from 'styled-components';
import LinkButton from '../../LinkButton';

export const ResourceViewGridItemLink = styled(LinkButton)`
    padding: 10px;
    border: 1px solid ${Colors.LIGHT_GRAY3} !important;

    .bp4-button-text {
        width: 100%;
        text-align: left;
    }
`;

export const ResourceViewGridWrapper = styled.div`
    padding: 12px 20px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 20px;
`;

export const ResourceViewGridItemTitle = styled(Text)`
    font-weight: 600;
    text-align: left;
    margin-top: 5px;
    margin-bottom: 10px;
`;

export const ResourceViewGridItemCountWrapper = styled.span`
    display: flex;
    align-items: center;
`;

export const ResourceViewGridItemCountIcon = styled(Icon)`
    margin-right: 5px;
`;

export const ResourceViewGridItemCountText = styled(Text)`
    color: ${Colors.GRAY3};
    font-size: 12px;
    font-weight: 600;
    margin-right: 10px;
`;

export const ResourceViewGridItemHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

export const ResourceViewGridItemFooter = styled.div`
    display: flex;
`;

export const ResourceViewGridItemCount: FC<{
    icon: IconName;
    value: number;
}> = ({ icon, value }) => {
    return (
        <ResourceViewGridItemCountWrapper>
            <ResourceViewGridItemCountIcon
                icon={icon}
                size={12}
                color={Colors.GRAY3}
            />
            <ResourceViewGridItemCountText>
                {value}
            </ResourceViewGridItemCountText>
        </ResourceViewGridItemCountWrapper>
    );
};
