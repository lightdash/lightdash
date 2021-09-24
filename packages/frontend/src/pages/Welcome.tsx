import React, { FC } from 'react';
import {
    Colors,
    Card,
    H2,
    H4,
    H5,
    Callout,
    Icon,
    Intent,
    AnchorButton,
} from '@blueprintjs/core';
import { Redirect, useHistory } from 'react-router-dom';
import { useApp } from '../providers/AppProvider';
import AboutFooter from '../components/AboutFooter';
import PageSpinner from '../components/PageSpinner';
import './Welcome.css';

const Step: FC<{
    title: string;
    focused: boolean;
    checked: boolean;
    disabled: boolean;
    pathname: string;
}> = ({ title, focused, checked, disabled, pathname }) => {
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

    if (health.isLoading) {
        return <PageSpinner />;
    }

    if (
        health.status === 'success' &&
        !health.data?.needsSetup &&
        !health.data?.needsProject
    ) {
        return (
            <Redirect
                to={{
                    pathname: '/',
                }}
            />
        );
    }

    return (
        <div
            style={{
                height: '100vh',
                display: 'grid',
                justifyContent: 'center',
                background: Colors.LIGHT_GRAY4,
            }}
        >
            <div
                style={{
                    width: '400px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
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
                        focused={!!health.data?.needsSetup}
                        disabled={!health.data?.needsSetup}
                        checked={!health.data?.needsSetup}
                        pathname="/register"
                    />
                    <Step
                        title="2. Create project"
                        focused={!health.data?.needsSetup}
                        disabled={!!health.data?.needsSetup}
                        checked={!health.data?.needsProject}
                        pathname="/createProject"
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
                        href="https://community.lightdash.com/"
                        target="_blank"
                        minimal
                        icon="chat"
                        style={{ justifyContent: 'flex-start' }}
                    >
                        Join the conversation!
                    </AnchorButton>
                </Card>
                <AboutFooter />
            </div>
        </div>
    );
};

export default Welcome;
