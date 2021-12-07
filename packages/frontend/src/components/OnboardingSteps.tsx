import {
    AnchorButton,
    Card,
    Colors,
    H5,
    IconName,
    Tag,
} from '@blueprintjs/core';
import { IncompleteOnboarding } from 'common';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';
import {
    OnboardingStepClickedEvent,
    useTracking,
} from '../providers/TrackingProvider';
import { EventName } from '../types/Events';

const OnboardingStep: FC<{
    icon: IconName;
    title: string;
    description: string;
    href: string;
    buttonHref: string;
    isComplete: boolean;
    action: OnboardingStepClickedEvent['properties']['action'];
}> = ({ icon, title, description, href, buttonHref, isComplete, action }) => {
    const history = useHistory();
    const { track } = useTracking();
    return (
        <Card
            style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}
            interactive
            onClick={() => {
                track({
                    name: EventName.ONBOARDING_STEP_CLICKED,
                    properties: {
                        action,
                    },
                });
                history.push(href);
            }}
        >
            <Tag
                round
                large
                minimal={isComplete}
                style={{
                    width: '40px',
                    height: '40px',
                    marginRight: 20,
                }}
                intent={isComplete ? 'success' : 'none'}
                icon={isComplete ? 'tick' : icon}
            />
            <div
                style={{
                    flex: 1,
                }}
            >
                <H5
                    style={{
                        marginBottom: 2,
                        textDecorationLine: isComplete
                            ? 'line-through'
                            : undefined,
                    }}
                >
                    {title}
                </H5>
                <p
                    style={{
                        margin: 0,
                        color: Colors.GRAY2,
                        fontWeight: 500,
                    }}
                >
                    {description}
                </p>
            </div>
            <AnchorButton
                minimal
                outlined
                href={buttonHref}
                target="_blank"
                onClick={(e) => {
                    e.stopPropagation();
                    track({
                        name: EventName.DOCUMENTATION_BUTTON_CLICKED,
                        properties: {
                            action,
                        },
                    });
                }}
            >
                Learn how
            </AnchorButton>
        </Card>
    );
};

const OnboardingSteps: FC<{
    status: IncompleteOnboarding;
    projectUuid: string;
}> = ({
    projectUuid,
    status: {
        connectedProject,
        definedMetric,
        ranQuery,
        savedChart,
        invitedUser,
    },
}) => (
    <>
        <OnboardingStep
            icon="folder-close"
            title="Connect a project"
            description="to get the ball rollin'"
            href={`/projects/${projectUuid}/settings`}
            buttonHref="https://docs.lightdash.com/get-started/setup-lightdash/connect-project"
            isComplete={connectedProject}
            action="connect_project"
        />
        <OnboardingStep
            icon="numbered-list"
            title="Define metrics in your dbt project"
            description="to start exploring your data"
            href="https://docs.lightdash.com/get-started/setup-lightdash/add-metrics"
            buttonHref="https://docs.lightdash.com/get-started/setup-lightdash/add-metrics"
            isComplete={definedMetric}
            action="define_metrics"
        />
        <OnboardingStep
            icon="search-template"
            title="Run a query"
            description="to answer a business question"
            href={`/projects/${projectUuid}/tables`}
            buttonHref="https://docs.lightdash.com/get-started/exploring-data/using-explores"
            isComplete={ranQuery}
            action="run_query"
        />
        <OnboardingStep
            icon="grouped-bar-chart"
            title="Save a chart"
            description="to share your insights"
            href={`/projects/${projectUuid}/tables`}
            buttonHref="https://docs.lightdash.com/get-started/exploring-data/sharing-insights"
            isComplete={savedChart}
            action="save_chart"
        />
        <OnboardingStep
            icon="new-person"
            title="Invite a user"
            description="to start collaborating"
            href="https://docs.lightdash.com/get-started/exploring-data/sharing-insights#inviting-your-teammates-to-your-lightdash-project"
            buttonHref="https://docs.lightdash.com/get-started/exploring-data/sharing-insights#inviting-your-teammates-to-your-lightdash-project"
            isComplete={invitedUser}
            action="invite_user"
        />
    </>
);

export default OnboardingSteps;
