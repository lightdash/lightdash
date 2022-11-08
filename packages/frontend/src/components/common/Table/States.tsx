import { NonIdealState, Spinner } from '@blueprintjs/core';
import styled from 'styled-components';

const NonIdealStateWithPadding = styled(NonIdealState)`
    padding-top: 50px;
    padding-bottom: 30px;
    flex: 1;
`;

export const IdleState = () => (
    <NonIdealStateWithPadding title="Run query to see your results" />
);

export const EmptyState = () => (
    <NonIdealStateWithPadding
        title="Query returned no results"
        description="This query ran successfully but returned no results"
    />
);

export const LoadingState = () => (
    <NonIdealStateWithPadding title="Loading results" icon={<Spinner />} />
);
