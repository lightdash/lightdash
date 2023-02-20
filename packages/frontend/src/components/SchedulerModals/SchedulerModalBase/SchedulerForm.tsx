import { Button, Classes, Colors, HTMLSelect, Icon } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useMemo } from 'react';
import useHealth from '../../../hooks/health/useHealth';
import { useSlackChannels } from '../../../hooks/slack/useSlackChannels';
import { useGetSlack } from '../../../hooks/useSlack';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';
import { ArrayInput } from '../../ReactHookForm/ArrayInput';
import AutoComplete from '../../ReactHookForm/AutoComplete';
import CronInput from '../../ReactHookForm/CronInput';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import Select from '../../ReactHookForm/Select';
import { FormGroupWrapper } from '../../SavedQueries/SavedQueries.style';
import { hasRequiredScopes } from '../../UserSettings/SlackSettingsPanel';
import { EmailIcon, SlackIcon, TargetRow } from './SchedulerModalBase.styles';

enum SlackStates {
    LOADING,
    SUCCESS,
    NO_SLACK,
    MISSING_SCOPES,
}

const SlackErrorContent: FC<{ slackState: SlackStates }> = ({
    slackState,
}): JSX.Element => {
    if (slackState === SlackStates.NO_SLACK) {
        return (
            <>
                <p>No Slack integration found</p>
                <p>
                    To create a slack scheduled delivery, you need to
                    <a href="https://docs.lightdash.com/guides/enable-slack-selfhost">
                        {' '}
                        setup Slack{' '}
                    </a>
                    for your Lightdash instance
                </p>
            </>
        );
    } else if (slackState === SlackStates.MISSING_SCOPES) {
        return (
            <>
                <p>Slack integration needs to be reinstalled</p>
                <p>
                    To create a slack scheduled delivery, you need to
                    <a href="/generalSettings/slack">
                        {' '}
                        reinstall the Slack integration{' '}
                    </a>
                    for your organisation
                </p>
            </>
        );
    }
    return <></>;
};
const SchedulerForm: FC<
    { disabled: boolean } & React.ComponentProps<typeof Form>
> = ({ disabled, methods, ...rest }) => {
    const slackQuery = useGetSlack();
    const slackState = useMemo(() => {
        if (slackQuery.isLoading) {
            return SlackStates.LOADING;
        } else {
            if (
                slackQuery.data?.slackTeamName === undefined ||
                slackQuery.isError
            ) {
                return SlackStates.NO_SLACK;
            } else if (slackQuery.data && !hasRequiredScopes(slackQuery.data)) {
                return SlackStates.MISSING_SCOPES;
            }
            return SlackStates.SUCCESS;
        }
    }, [slackQuery]);

    const slackChannelsQuery = useSlackChannels();
    const slackChannels = useMemo(
        () =>
            (slackChannelsQuery.data || []).map((channel) => ({
                value: channel.id,
                label: channel.name,
            })),
        [slackChannelsQuery.data],
    );
    const health = useHealth();

    const isAddSlackDisabled = disabled || slackState !== SlackStates.SUCCESS;
    const isAddEmailDisabled = disabled || !health.data?.hasEmailClient;

    return (
        <Form name="scheduler" methods={methods} {...rest}>
            <Input
                label="Name"
                name="name"
                placeholder="Scheduled delivery name"
                disabled={disabled}
                rules={{
                    required: 'Required field',
                }}
            />
            <CronInput
                name="cron"
                defaultValue="0 9 * * 1"
                disabled={disabled}
                rules={{
                    required: 'Required field',
                    validate: {
                        isValidCronExpression:
                            isInvalidCronExpression('Cron expression'),
                    },
                }}
            />

            <Select
                label="Format"
                name="format"
                options={[
                    { value: 'image', label: 'Image' },
                    { value: 'csv', label: 'CSV' },
                ]}
            />
            <ArrayInput
                label="Send to"
                name="targets"
                disabled={disabled}
                renderRow={(key, index, remove) => {
                    const isSlack =
                        methods.getValues()?.targets?.[index]?.channel !==
                        undefined;

                    if (isSlack) {
                        return (
                            <TargetRow key={key}>
                                <SlackIcon />
                                <AutoComplete
                                    name={`targets.${index}.channel`}
                                    items={slackChannels}
                                    disabled={disabled}
                                    isLoading={slackChannelsQuery.isLoading}
                                    rules={{
                                        required: 'Required field',
                                    }}
                                    suggestProps={{
                                        inputProps: {
                                            placeholder:
                                                'Search slack channel...',
                                        },
                                    }}
                                />
                                <Button
                                    minimal={true}
                                    icon={'cross'}
                                    onClick={() => remove(index)}
                                    disabled={disabled}
                                />
                            </TargetRow>
                        );
                    } else {
                        return (
                            <TargetRow key={key}>
                                <EmailIcon size={20} color={Colors.GRAY1} />
                                <Input
                                    name={`targets.${index}.recipient`}
                                    placeholder="Email recipient"
                                    disabled={disabled}
                                    rules={{
                                        required: 'Required field',
                                    }}
                                />
                                <Button
                                    minimal={true}
                                    icon={'cross'}
                                    onClick={() => remove(index)}
                                    disabled={disabled}
                                />
                            </TargetRow>
                        );
                    }
                }}
                renderAppendRowButton={(append) => (
                    <>
                        <Tooltip2
                            interactionKind="hover"
                            content={<>{SlackErrorContent({ slackState })}</>}
                            position="bottom"
                            disabled={slackState === SlackStates.SUCCESS}
                        >
                            <Button
                                minimal
                                className={
                                    isAddSlackDisabled
                                        ? Classes.DISABLED
                                        : undefined
                                }
                                onClick={
                                    isAddSlackDisabled
                                        ? undefined
                                        : () => append({ channel: '' })
                                }
                                icon={'plus'}
                                text="Add slack"
                            />
                        </Tooltip2>
                        <Tooltip2
                            interactionKind="hover"
                            content={
                                <>
                                    <p>No Email integration found</p>
                                    <p>
                                        To create a slack scheduled delivery,
                                        you need to add
                                        <a href="https://docs.lightdash.com/references/environmentVariables">
                                            {' '}
                                            SMTP environment variables{' '}
                                        </a>
                                        for your Lightdash instance
                                    </p>
                                </>
                            }
                            position="bottom"
                            disabled={health.data?.hasEmailClient}
                        >
                            <Button
                                minimal
                                onClick={
                                    isAddEmailDisabled
                                        ? undefined
                                        : () => append({ recipients: '' })
                                }
                                icon={'plus'}
                                text="Add email"
                                className={
                                    isAddEmailDisabled
                                        ? Classes.DISABLED
                                        : undefined
                                }
                            />
                        </Tooltip2>
                    </>
                )}
            />
        </Form>
    );
};

export default SchedulerForm;
