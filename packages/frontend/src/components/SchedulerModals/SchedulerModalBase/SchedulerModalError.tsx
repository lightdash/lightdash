import {
    AnchorButton,
    Button,
    DialogBody,
    DialogFooter,
    DialogProps,
    NonIdealState,
} from '@blueprintjs/core';
import { hasRequiredScopes, SlackSettings } from '@lightdash/common';
import React, { FC, useMemo } from 'react';
import { useApp } from '../../../providers/AppProvider';

const SchedulerModalError: FC<{
    slackSettings: SlackSettings | undefined;
    onClose: DialogProps['onClose'];
}> = ({ slackSettings, onClose }) => {
    const {
        health: { data: health },
        user,
    } = useApp();

    const error = useMemo(() => {
        if (!health?.hasSlack) {
            return (
                <NonIdealState
                    title="No Slack integration found"
                    description="To create a scheduled delivery, you need to setup Slack for your Lightdash instance."
                    icon={'info-sign'}
                    action={
                        <AnchorButton
                            intent="primary"
                            target="_blank"
                            href={`https://docs.lightdash.com/guides/enable-slack-selfhost`}
                        >
                            Add Slack integration
                        </AnchorButton>
                    }
                />
            );
        } else {
            let title = 'No Slack configuration found';
            let description =
                'To create a scheduled delivery, you need to setup Slack for your organisation.';
            if (slackSettings && !hasRequiredScopes(slackSettings)) {
                title = 'Slack integration needs to be reinstalled';
                description =
                    'To create a scheduled delivery, you need to reinstall the Slack integration for your organisation.';
            }
            const canManageSlackIntegration = user.data?.ability.can(
                'manage',
                'Organization',
            );
            return (
                <NonIdealState
                    title={title}
                    description={
                        canManageSlackIntegration
                            ? description
                            : `${description} Please contact your administrator.`
                    }
                    icon={'info-sign'}
                    action={
                        canManageSlackIntegration ? (
                            <AnchorButton
                                intent="primary"
                                href={`/generalSettings/slack`}
                            >
                                Configure Slack
                            </AnchorButton>
                        ) : undefined
                    }
                />
            );
        }
    }, [health?.hasSlack, slackSettings, user.data?.ability]);
    return (
        <>
            <DialogBody>{error}</DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button onClick={onClose}>Back</Button>
                    </>
                }
            />
        </>
    );
};
export default SchedulerModalError;
