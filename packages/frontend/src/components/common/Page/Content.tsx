import React, { FC } from 'react';
import styled from 'styled-components';
import { Section } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';

const StyledDiv = styled('div')`
    padding: 10px 10px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
    min-width: 0;
`;

const Content: FC = ({ children }) => (
    <StyledDiv>
        <Section name={SectionName.PAGE_CONTENT}>{children}</Section>
    </StyledDiv>
);

export default Content;
