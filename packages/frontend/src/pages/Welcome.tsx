import {
    AnchorButton,
    Callout,
    Card,
    Colors,
    H2,
    H4,
    H5,
    Icon,
    Intent,
} from '@blueprintjs/core';
import React, { FC } from 'react';
import { Redirect, useHistory } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import { useOrganisation } from '../hooks/organisation/useOrganisation';
import { useApp } from '../providers/AppProvider';
import {
    SetupStepClickedEvent,
    useTracking,
} from '../providers/TrackingProvider';
import { EventName } from '../types/Events';
import './Welcome.css';

const Step: FC<{
    title: string;
    focused: boolean;
    checked: boolean;
    disabled: boolean;
    pathname: string;
    action: SetupStepClickedEvent['properties']['action'];
}> = ({ title, focused, checked, disabled, pathname, action }) => {
    const { track } = useTracking();
    const history = useHistory();
    const isClickable = !checked && !disabled;
    let intent: Intent = 'none';

    if (checked) {
        intent = 'success';
    } else if (focused) {
        intent = 'primary';
    }

    const onClick = () => {
        if (isClickable) {
            track({
                name: EventName.SETUP_STEP_CLICKED,
                properties: {
                    action,
                },
            });
            history.push({
                pathname,
            });
        }
    };
    return (
        <Callout
            intent={intent}
            icon={checked ? undefined : 'circle'}
            onClick={onClick}
            className="welcome-step"
            style={{
                cursor: isClickable ? 'pointer' : undefined,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                <H5
                    style={{
                        margin: 0,
                        flex: 1,
                        color: disabled ? Colors.GRAY1 : 'inherit',
                    }}
                >
                    {title}
                </H5>
                {!checked && !disabled && (
                    <Icon icon="chevron-left" iconSize={20} intent={intent} />
                )}
            </div>
        </Callout>
    );
};

const Welcome: FC = () => {
    const { health } = useApp();
    const { data: orgData } = useOrganisation();

    if (health.isLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && !orgData?.needsProject) {
        return (
            <Redirect
                to={{
                    pathname: '/',
                }}
            />
        );
    }

    const needsSetup = false; //health.data?.needsSetup

    return (
        <Page isFullHeight>
            <div
                style={{
                    width: '400px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    flex: 1,
                }}
            >
                <H2 style={{ marginBottom: 25 }}>Welcome to Lightdash</H2>
                <H4 style={{ marginBottom: 25 }}>
                    <Icon
                        icon="form"
                        style={{ marginRight: 10 }}
                        iconSize={20}
                        intent="primary"
                    />
                    Setup steps
                </H4>
                <Card
                    style={{
                        padding: 25,
                        display: 'flex',
                        flexDirection: 'column',
                        marginBottom: 25,
                    }}
                    elevation={2}
                >
                    <Step
                        title="1. Create user"
                        focused={!!needsSetup}
                        disabled={!needsSetup}
                        checked={!needsSetup}
                        pathname="/register"
                        action="create_user"
                    />
                    <Step
                        title="2. Create project"
                        focused={!needsSetup}
                        disabled={!!needsSetup}
                        checked={!orgData?.needsProject}
                        pathname="/createProject"
                        action="create_project"
                    />
                </Card>
                <H4 style={{ marginBottom: 25 }}>
                    <Icon
                        icon="book"
                        style={{ marginRight: 10 }}
                        iconSize={20}
                        intent="primary"
                    />
                    Learn more
                </H4>
                <Card
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <AnchorButton
                        href="https://docs.lightdash.com/"
                        target="_blank"
                        minimal
                        icon="lifesaver"
                        style={{ justifyContent: 'flex-start' }}
                    >
                        Lightdash Documentation
                    </AnchorButton>
                    <AnchorButton
                        href="https://github.com/lightdash/lightdash/discussions"
                        target="_blank"
                        minimal
                        icon="chat"
                        style={{ justifyContent: 'flex-start' }}
                    >
                        Join the conversation!
                    </AnchorButton>
                </Card>
            </div>
        </Page>
    );
};

export default Welcome;
