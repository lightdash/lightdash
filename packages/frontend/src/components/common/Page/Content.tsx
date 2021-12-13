import React, { FC } from 'react';
import styled from 'styled-components';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';

const StyledDiv = styled('div')`
    padding: 20px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 100vw;
`;

const Content: FC = ({ children }) => (
    <StyledDiv>
        <TrackSection name={SectionName.PAGE_CONTENT}>{children}</TrackSection>
    </StyledDiv>
);

export default Content;
