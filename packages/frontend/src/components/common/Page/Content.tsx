import React, { FC } from 'react';
import styled, { css } from 'styled-components';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';

const StyledDiv = styled.div<{ noPadding?: boolean }>`
    padding: 20px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 100vw;

    ${({ noPadding }) =>
        noPadding &&
        css`
            padding: 0;
        `}
`;

interface Props {
    noPadding?: boolean;
}

const Content: FC<Props> = ({ noPadding, children }) => (
    <StyledDiv noPadding={noPadding}>
        <TrackSection name={SectionName.PAGE_CONTENT}>{children}</TrackSection>
    </StyledDiv>
);

export default Content;
