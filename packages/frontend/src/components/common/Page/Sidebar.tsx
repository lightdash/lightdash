import { Card, Divider, H3 } from '@blueprintjs/core';
import React, { FC } from 'react';
import styled from 'styled-components';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import AboutFooter from '../../AboutFooter';

export const SIDEBAR_WIDTH = 400;
export const SIDEBAR_Z_INDEX = 1;

const SidebarWrapper = styled(Card)`
    height: calc(100vh - 50px);
    flex-basis: ${SIDEBAR_WIDTH}px;
    z-index: ${SIDEBAR_Z_INDEX};
    flex-shrink: 0;
    flex-grow: 0;
    overflow: hidden;
    position: sticky;
    top: 50px;
    padding-bottom: 0;
`;

const SidebarColumn = styled('div')`
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
`;

const SidebarContent = styled('div')`
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
`;

interface SidebarProps {
    title?: string | React.ReactNode;
}

export const SidebarDivider = styled(Divider)`
    margin: 12px 0 18px 0;
`;

const Sidebar: FC<SidebarProps> = ({ title, children }) => (
    <SidebarWrapper elevation={1}>
        <TrackSection name={SectionName.SIDEBAR}>
            <SidebarColumn>
                <SidebarContent>
                    {typeof title === 'string' ? <H3>{title}</H3> : title}
                    {children}
                </SidebarContent>
                <AboutFooter minimal />
            </SidebarColumn>
        </TrackSection>
    </SidebarWrapper>
);

export default Sidebar;
