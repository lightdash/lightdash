import {
    Button,
    Colors,
    FormGroup,
    HTMLSelect,
    Icon,
    Radio,
    RadioGroup as RadioGroupBlueprint,
    Tab,
    Tabs,
} from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import cronstrue from 'cronstrue';
import React, { FC, useEffect, useMemo, useState } from 'react';
import useHealth from '../../../hooks/health/useHealth';
import { useSlackChannels } from '../../../hooks/slack/useSlackChannels';
import { useGetSlack } from '../../../hooks/useSlack';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';
import { Limit, Values } from '../../DownloadCsvPopup';
import { ArrayInput } from '../../ReactHookForm/ArrayInput';
import AutoComplete from '../../ReactHookForm/AutoComplete';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import RadioGroup from '../../ReactHookForm/RadioGroup';
import Select from '../../ReactHookForm/Select';
import { hasRequiredScopes } from '../../UserSettings/SlackSettingsPanel';
import {
    EmailIcon,
    SettingsWrapper,
    SlackIcon,
    TargetRow,
    Title,
} from './SchedulerModalBase.styles';

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

enum TabPages {
    SETTINGS = 'settings',
    OPTIONS = 'options',
}

const SchedulerOptions: FC<
    { disabled: boolean } & React.ComponentProps<typeof Form>
> = ({ disabled, methods, ...rest }) => {
    const [format, setFormat] = useState(
        methods.getValues()?.options?.formatted ? Values.FORMATTED : Values.RAW,
    );
    return (
        <Form name="options" methods={methods} {...rest}>
            <FormGroup>
                <RadioGroupBlueprint
                    label={<Title>Values</Title>}
                    onChange={(e: any) => {
                        setFormat(e.currentTarget.value);
                        methods.setValue(
                            'options.formatted',
                            e.currentTarget.value === Values.FORMATTED,
                        );
                    }}
                    selectedValue={format}
                >
                    <Radio label="Formatted" value={Values.FORMATTED} />
                    <Radio label="Raw" value={Values.RAW} />
                </RadioGroupBlueprint>
            </FormGroup>

            <RadioGroup
                name="options.limit"
                label="Limit"
                defaultValue={Limit.TABLE}
            >
                <Radio label="Results in Table" value={Limit.TABLE} />
                <Radio label="All Results" value={Limit.ALL} />
                <Radio label="Custom..." value={Limit.CUSTOM} />
            </RadioGroup>
        </Form>
    );
};

const SchedulerSettings: FC<
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
                                onClick={() => append({ channel: '' })}
                                icon={'plus'}
                                text="Add slack"
                                disabled={
                                    disabled ||
                                    slackState !== SlackStates.SUCCESS
                                }
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

const SchedulerForm: FC<
    { disabled: boolean } & React.ComponentProps<typeof Form>
> = ({ disabled, methods, ...rest }) => {
    const [tab, setTab] = useState<string | number>(TabPages.SETTINGS);
    const isCsv = useMemo(
        () => methods.getValues()?.format === 'csv',
        [methods.getValues()?.format],
    );

    useEffect(() => {
        // If the format is not csv, we want to clear the options
        if (!isCsv) methods.setValue('options', {});
    }, [isCsv]);

    if (isCsv) {
        return (
            <Tabs
                onChange={setTab}
                selectedTabId={tab}
                renderActiveTabPanelOnly={false}
            >
                <Tab
                    id={TabPages.SETTINGS}
                    title="Settings"
                    panel={
                        <SchedulerSettings
                            disabled={disabled}
                            methods={methods}
                        />
                    }
                />
                <Tab
                    id={TabPages.OPTIONS}
                    title="Advanced options"
                    panel={<SchedulerOptions methods={methods} />}
                />
            </Tabs>
        );
    } else {
        return (
            <SettingsWrapper>
                <SchedulerSettings disabled={disabled} methods={methods} />
            </SettingsWrapper>
        );
    }
};

export default SchedulerForm;
