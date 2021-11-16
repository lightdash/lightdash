import { Card, Divider, H3 } from '@blueprintjs/core';
import React, { FC } from 'react';
import styled from 'styled-components';
import { Section } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import AboutFooter from '../../AboutFooter';

const SidebarWrapper = styled(Card)`
    height: calc(100vh - 50px);
    flex-basis: 400px;
    flex-shrink: 0;
    flex-grow: 0;
    margin-right: 10px;
    overflow: hidden;
    position: sticky;
    top: 50px;
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

const TitleDivider = styled(Divider)`
    margin-top: 20px;
    margin-bottom: 20px;
`;

const Sidebar: FC<{ title: string | React.ReactNode }> = ({
    title,
    children,
}) => (
    <SidebarWrapper elevation={1}>
        <Section name={SectionName.SIDEBAR}>
            <SidebarColumn>
                <SidebarContent>
                    {typeof title === 'string' ? <H3>{title}</H3> : title}
                    <TitleDivider />
                    {children}
                </SidebarContent>
                <AboutFooter />
            </SidebarColumn>
        </Section>
    </SidebarWrapper>
);

export default Sidebar;
