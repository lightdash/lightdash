import { Button, Colors, Icon } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import cronstrue from 'cronstrue';
import React, { FC, useMemo } from 'react';
import useHealth from '../../../hooks/health/useHealth';
import { useSlackChannels } from '../../../hooks/slack/useSlackChannels';
import { useGetSlack } from '../../../hooks/useSlack';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';
import { ArrayInput } from '../../ReactHookForm/ArrayInput';
import AutoComplete from '../../ReactHookForm/AutoComplete';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import { hasRequiredScopes } from '../../UserSettings/SlackSettingsPanel';
import { EmailIcon, SlackIcon, TargetRow } from './SchedulerModalBase.styles';

enum States {
    LOADING,
    SUCCESS,
    ERROR,
}

const SchedulerForm: FC<
    { disabled: boolean } & React.ComponentProps<typeof Form>
> = ({ disabled, methods, ...rest }) => {
    const slackQuery = useGetSlack();
    const state = useMemo(() => {
        if (slackQuery.isLoading) {
            return States.LOADING;
        } else {
            const isValidSlack =
                slackQuery.data?.slackTeamName !== undefined &&
                !slackQuery.isError &&
                hasRequiredScopes(slackQuery.data);
            return isValidSlack ? States.SUCCESS : States.ERROR;
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

    const cronValue = methods.watch('cron', '0 9 * * 1');
    const cronHelperText = useMemo(() => {
        const validationError =
            isInvalidCronExpression('Cron expression')(cronValue);
        const cronHumanString = cronstrue.toString(cronValue, {
            verbose: true,
            throwExceptionOnParseError: false,
        });
        return validationError ?? cronHumanString;
    }, [cronValue]);

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
            <Input
                label="Cron expression (UTC)"
                name="cron"
                placeholder="0 9 * * 1"
                defaultValue="0 9 * * 1"
                helperText={cronHelperText}
                disabled={disabled}
                rules={{
                    required: 'Required field',
                    validate: {
                        isValidCronExpression:
                            isInvalidCronExpression('Cron expression'),
                    },
                }}
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
                            hoverCloseDelay={500}
                            interactionKind="hover"
                            content={
                                <>
                                    <p>No Slack integration found</p>
                                    <p>
                                        To create a slack scheduled delivery,
                                        you need to{' '}
                                        <a href="https://docs.lightdash.com/guides/enable-slack-selfhost">
                                            setup Slack
                                        </a>{' '}
                                        for your Lightdash instance
                                    </p>
                                </>
                            }
                            position="bottom"
                            disabled={state === States.SUCCESS}
                        >
                            <Button
                                minimal
                                onClick={() => append({ channel: '' })}
                                icon={'plus'}
                                text="Add slack"
                                disabled={disabled || state !== States.SUCCESS}
                            />
                        </Tooltip2>
                        <Tooltip2
                            hoverCloseDelay={500}
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
                                onClick={() => append({ recipients: '' })}
                                icon={'plus'}
                                text="Add email"
                                disabled={
                                    disabled || !health.data?.hasEmailClient
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
