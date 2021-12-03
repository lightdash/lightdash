import {
    AnchorButton,
    Card,
    Colors,
    H5,
    IconName,
    Tag,
} from '@blueprintjs/core';
import { OnboardingStatus } from 'common';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';

const OnboardingStep: FC<{
    icon: IconName;
    title: string;
    description: string;
    href: string;
    buttonHref: string;
    isComplete: boolean;
}> = ({ icon, title, description, href, buttonHref, isComplete }) => {
    const history = useHistory();
    return (
        <Card
            style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}
            interactive
            onClick={() => history.push(href)}
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
                }}
            >
                Learn how
            </AnchorButton>
        </Card>
    );
};

const OnboardingSteps: FC<{ status: OnboardingStatus; projectUuid: string }> =
    ({
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
            />
            <OnboardingStep
                icon="numbered-list"
                title="Define metrics in your dbt project"
                description="to start exploring your data"
                href="https://docs.lightdash.com/get-started/setup-lightdash/add-metrics"
                buttonHref="https://docs.lightdash.com/get-started/setup-lightdash/add-metrics"
                isComplete={definedMetric}
            />
            <OnboardingStep
                icon="search-template"
                title="Run a query"
                description="to answer a business question"
                href={`/projects/${projectUuid}/tables`}
                buttonHref="https://docs.lightdash.com/get-started/exploring-data/using-explores"
                isComplete={ranQuery}
            />
            <OnboardingStep
                icon="grouped-bar-chart"
                title="Save a chart"
                description="to share your insights"
                href={`/projects/${projectUuid}/tables`}
                buttonHref="https://docs.lightdash.com/get-started/exploring-data/sharing-insights"
                isComplete={savedChart}
            />
            <OnboardingStep
                icon="new-person"
                title="Invite a user"
                description="to start collaborating"
                href="https://docs.lightdash.com/get-started/exploring-data/sharing-insights#inviting-your-teammates-to-your-lightdash-project"
                buttonHref="https://docs.lightdash.com/get-started/exploring-data/sharing-insights#inviting-your-teammates-to-your-lightdash-project"
                isComplete={invitedUser}
            />
        </>
    );

export default OnboardingSteps;
