import { Intent, NonIdealState } from '@blueprintjs/core';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import {
    ButtonWrapper,
    CTA,
    EmptyStateIcon,
    EmptyStateWrapper,
    Title,
} from './EmptySavedChartsState.styles';

const EmptySavedChartsState: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return (
        <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
            <div style={{ padding: '50px 0' }}>
                <NonIdealState
                    description={
                        <EmptyStateWrapper>
                            <EmptyStateIcon
                                icon="grouped-bar-chart"
                                size={59}
                            />
                            <Title>You haven’t saved any charts yet.</Title>
                            <p>
                                Create a saved chart from your queries so you
                                can find it here!
                            </p>
                        </EmptyStateWrapper>
                    }
                    action={
                        <ButtonWrapper>
                            <CTA
                                text="Run a query"
                                intent={Intent.PRIMARY}
                                href={`/projects/${projectUuid}/tables`}
                            />
                        </ButtonWrapper>
                    }
                />
            </div>
        </TrackSection>
    );
};

export default EmptySavedChartsState;
