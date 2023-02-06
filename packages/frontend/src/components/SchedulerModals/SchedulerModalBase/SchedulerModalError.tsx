import {
    AnchorButton,
    Button,
    DialogBody,
    DialogFooter,
    DialogProps,
    NonIdealState,
} from '@blueprintjs/core';
import React, { FC } from 'react';
import { useApp } from '../../../providers/AppProvider';

const SchedulerModalError: FC<{
    onClose: DialogProps['onClose'];
}> = ({ onClose }) => {
    const {
        health: { data: health },
    } = useApp();
    return (
        <>
            <DialogBody>
                {!health?.hasSlack ? (
                    <NonIdealState
                        title="No Slack configuration found"
                        description="To create a scheduled delivery, you need to setup Slack for your organisation."
                        icon={'info-sign'}
                        action={
                            <AnchorButton
                                intent="primary"
                                href={`/generalSettings/slack`}
                            >
                                Configuration Slack
                            </AnchorButton>
                        }
                    />
                ) : (
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
                )}
            </DialogBody>
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
