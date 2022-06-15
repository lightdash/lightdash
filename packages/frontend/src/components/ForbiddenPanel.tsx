import { NonIdealState } from '@blueprintjs/core';
import { FC } from 'react';
import styled from 'styled-components';

const ForbiddenPanelWrapper = styled.div`
    margin-top: 30vh;
`;

const ForbiddenPanel: FC = () => (
    <ForbiddenPanelWrapper>
        <NonIdealState
            title="You don't have access"
            description="Please ask an admin for permission"
            icon="key"
        />
    </ForbiddenPanelWrapper>
);

export default ForbiddenPanel;
