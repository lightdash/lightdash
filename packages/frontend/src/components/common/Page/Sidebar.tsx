import React, { FC } from 'react';
import styled from 'styled-components';
import { Card, Divider, H3 } from '@blueprintjs/core';
import { SectionName } from '../../../types/Events';
import { Section } from '../../../providers/TrackingProvider';
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

const Sidebar: FC<{ title: string | React.ReactNode }> = ({
    title,
    children,
}) => (
    <SidebarWrapper elevation={1}>
        <Section name={SectionName.SIDEBAR}>
            <SidebarColumn>
                <div style={{ flex: 1 }}>
                    {typeof title === 'string' ? <H3>{title}</H3> : title}
                    <Divider style={{ marginTop: 20 }} />
                    {children}
                </div>
                <AboutFooter />
            </SidebarColumn>
        </Section>
    </SidebarWrapper>
);

export default Sidebar;
