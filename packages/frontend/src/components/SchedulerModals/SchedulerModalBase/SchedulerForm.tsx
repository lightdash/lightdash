import {
    Button,
    Classes,
    Colors,
    FormGroup,
    NumericInput,
    Radio,
    RadioGroup,
} from '@blueprintjs/core';
import { MenuItem2, Tooltip2 } from '@blueprintjs/popover2';
import {
    CreateSchedulerAndTargetsWithoutIds,
    SchedulerFormat,
} from '@lightdash/common';
import { Anchor, Box, Switch, Tooltip } from '@mantine/core';
import React, { FC, useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import useHealth from '../../../hooks/health/useHealth';

import { IconInfoCircle } from '@tabler/icons-react';
import { useSlackChannels } from '../../../hooks/slack/useSlackChannels';
import { useGetSlack } from '../../../hooks/useSlack';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';
import MantineIcon from '../../common/MantineIcon';
import { ArrayInput } from '../../ReactHookForm/ArrayInput';
import AutoComplete from '../../ReactHookForm/AutoComplete';
import CronInput from '../../ReactHookForm/CronInput';
import {
    InlinedInputs,
    InlinedLabel,
    InlineIcon,
} from '../../ReactHookForm/CronInput/CronInput.styles';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import { hasRequiredScopes } from '../../UserSettings/SlackSettingsPanel';
import {
    EmailIcon,
    InputGroupWrapper,
    InputWrapper,
    SlackIcon,
    StyledSelect,
    TargetRow,
    Title,
} from './SchedulerModalBase.styles';

const isSlack = (
    target: CreateSchedulerAndTargetsWithoutIds['targets'][number],
): target is {
    channel: string;
} => 'channel' in target && target.channel !== undefined;

export enum Limit {
    TABLE = 'table',
    ALL = 'all',
    CUSTOM = 'custom',
}

export enum Values {
    FORMATTED = 'formatted',
    RAW = 'raw',
}

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
                    <Anchor
                        target="_blank"
                        href="https://docs.lightdash.com/self-host/customize-deployment/configure-a-slack-app-for-lightdash"
                    >
                        {' '}
                        setup Slack{' '}
                    </Anchor>
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
                    <Anchor href="/generalSettings/integrations/slack">
                        {' '}
                        reinstall the Slack integration{' '}
                    </Anchor>
                    for your organization
                </p>
            </>
        );
    }
    return <></>;
};

const SchedulerOptions: FC<
    { disabled: boolean } & React.ComponentProps<typeof Form>
> = ({ disabled: _disabled, methods, ...rest }) => {
    const [format, setFormat] = useState(
        methods.getValues()?.options?.formatted === false
            ? Values.RAW
            : Values.FORMATTED,
    );
    const [defaultCustomLimit, defaultLimit] = useMemo(() => {
        const limit = methods.getValues()?.options?.limit;
        switch (limit) {
            case undefined:
            case Limit.TABLE:
                return [1, Limit.TABLE];
            case Limit.ALL:
                return [1, Limit.ALL];

            default:
                return [limit, Limit.CUSTOM];
        }
    }, [methods]);
    const [customLimit, setCustomLimit] = useState<number>(defaultCustomLimit);
    const [limit, setLimit] = useState<string>(defaultLimit);
    const health = useHealth();

    useEffect(() => {
        if (limit === Limit.CUSTOM) {
            methods.setValue('options.limit', customLimit);
        } else {
            methods.setValue('options.limit', limit);
        }
    }, [methods, customLimit, limit]);
    useEffect(() => {
        methods.setValue('options.formatted', format === Values.FORMATTED);
    }, [methods, format]);

    return (
        <Form name="options" methods={methods} {...rest}>
            <RadioGroup
                onChange={(e: any) => {
                    setFormat(e.currentTarget.value);
                }}
                selectedValue={format}
                label={<Title>Values</Title>}
            >
                <Radio label="Formatted" value={Values.FORMATTED} />
                <Radio label="Raw" value={Values.RAW} />
            </RadioGroup>

            <RadioGroup
                selectedValue={limit}
                label={<Title>Limit</Title>}
                onChange={(e: any) => {
                    const limitValue = e.currentTarget.value;
                    setLimit(limitValue);
                }}
            >
                <Radio label="Results in Table" value={Limit.TABLE} />
                <Radio label="All Results" value={Limit.ALL} />
                <Radio label="Custom..." value={Limit.CUSTOM} />
            </RadioGroup>
            {limit === Limit.CUSTOM && (
                <InputWrapper>
                    <NumericInput
                        value={customLimit}
                        min={1}
                        fill
                        onValueChange={(value: any) => {
                            setCustomLimit(value);
                        }}
                    />
                </InputWrapper>
            )}

            {(limit === Limit.ALL || limit === Limit.CUSTOM) && (
                <i>
                    Results are limited to{' '}
                    {Number(
                        health.data?.query.csvCellsLimit || 100000,
                    ).toLocaleString()}{' '}
                    cells for each file
                </i>
            )}
        </Form>
    );
};

const SchedulerImageOptions: FC<
    { disabled: boolean } & React.ComponentProps<typeof Form>
> = ({ methods }) => {
    const [withPdf, setWithPdf] = useState(
        methods.getValues()?.options?.withPdf,
    );

    // TODO: This form is using useEffect to interact
    // with the form library and it's not a great
    // pattern. We should consider moving to a different
    // form manager and not doing this
    useEffect(() => {
        methods.setValue('options.withPdf', withPdf);
    }, [methods, withPdf]);

    return (
        <Switch
            label="Also include image as PDF attachment"
            checked={withPdf}
            onChange={() => setWithPdf((old: boolean) => !old)}
        />
    );
};

const SchedulerForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const methods = useFormContext<CreateSchedulerAndTargetsWithoutIds>();

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
    const [showDestinationLabel, setShowDestinationLabel] =
        useState<boolean>(true);

    const isImageDisabled = !health.data?.hasHeadlessBrowser;

    const format = methods.watch(
        'format',
        isImageDisabled ? SchedulerFormat.CSV : SchedulerFormat.IMAGE,
    );

    return (
        <Form name="scheduler" methods={methods}>
            <FormGroup label={<Title>1. Name the delivery</Title>}>
                <Input
                    name="name"
                    placeholder="Scheduled delivery name"
                    disabled={disabled}
                    rules={{
                        required: 'Required field',
                    }}
                />
            </FormGroup>
            <FormGroup label={<Title>2. Set the frequency</Title>}>
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
            </FormGroup>
            <FormGroup label={<Title>3. Select format</Title>}>
                <InputGroupWrapper>
                    <InlinedInputs>
                        <InlinedLabel>Format</InlinedLabel>

                        <StyledSelect
                            value={format}
                            {...methods.register('format', {
                                value: format,

                                onChange: (e) => {
                                    methods.setValue(
                                        'format',
                                        e.currentTarget.value,
                                    );

                                    const isCsvValue =
                                        e.currentTarget.value ===
                                        SchedulerFormat.CSV;
                                    if (!isCsvValue) {
                                        methods.setValue('options', {
                                            withPdf: false,
                                        });
                                    } else {
                                        methods.setValue('options', {});
                                    }
                                },
                            })}
                            options={[
                                {
                                    value: SchedulerFormat.IMAGE,
                                    label: 'Image',
                                    disabled: isImageDisabled,
                                },
                                { value: SchedulerFormat.CSV, label: 'CSV' },
                            ]}
                        />
                        {isImageDisabled && (
                            <Tooltip2
                                position={'top'}
                                interactionKind="hover"
                                content={
                                    <p>
                                        You must enable the
                                        <Anchor href="https://docs.lightdash.com/self-host/customize-deployment/enable-headless-browser-for-lightdash">
                                            {' '}
                                            headless browser{' '}
                                        </Anchor>
                                        for sending images.
                                    </p>
                                }
                            >
                                <InlineIcon
                                    icon="info-sign"
                                    color={Colors.GRAY5}
                                />
                            </Tooltip2>
                        )}
                    </InlinedInputs>

                    {format === SchedulerFormat.CSV && (
                        <InlinedInputs>
                            <SchedulerOptions
                                disabled={disabled}
                                methods={methods}
                            />
                        </InlinedInputs>
                    )}

                    {format === SchedulerFormat.IMAGE && (
                        <SchedulerImageOptions methods={methods} />
                    )}
                    <Title>4. Add destination(s)</Title>

                    {showDestinationLabel && (
                        <InlinedLabel>No destination(s) selected</InlinedLabel>
                    )}

                    <InlinedInputs>
                        <ArrayInput
                            name="targets"
                            label=""
                            disabled={disabled}
                            renderRow={(key, index, remove) => {
                                setShowDestinationLabel(false);

                                const target =
                                    methods.getValues()?.targets?.[index];

                                if (isSlack(target)) {
                                    const isPrivateChannel = slackChannels.some(
                                        (channel) =>
                                            channel.label !== target.channel,
                                    );
                                    const allChannels =
                                        isPrivateChannel &&
                                        target.channel !== ''
                                            ? [
                                                  {
                                                      value: target.channel,
                                                      label: target.channel,
                                                  },
                                                  ...slackChannels,
                                              ]
                                            : slackChannels;

                                    return (
                                        <TargetRow key={key}>
                                            <SlackIcon />
                                            <AutoComplete
                                                groupBy={(item) => {
                                                    const channelPrefix =
                                                        item.label.charAt(0);
                                                    switch (channelPrefix) {
                                                        case '#':
                                                            return 'Channels';
                                                        case '@':
                                                            return 'Users';
                                                        default:
                                                            return 'Private Channels';
                                                    }
                                                }}
                                                name={`targets.${index}.channel`}
                                                items={allChannels}
                                                disabled={disabled}
                                                isLoading={
                                                    slackChannelsQuery.isLoading
                                                }
                                                rules={{
                                                    required: 'Required field',
                                                }}
                                                suggestProps={{
                                                    inputProps: {
                                                        placeholder:
                                                            'Search slack channel...',
                                                    },

                                                    createNewItemFromQuery: (
                                                        newItem: string,
                                                    ) => ({
                                                        label: newItem,
                                                        value: newItem,
                                                    }),
                                                    createNewItemRenderer: (
                                                        newItem: string,
                                                    ) => {
                                                        return (
                                                            <MenuItem2
                                                                icon="lock"
                                                                key={newItem}
                                                                text={newItem}
                                                                title={`Send to private channel #${newItem}`}
                                                                onClick={() => {
                                                                    methods.setValue(
                                                                        `targets.${index}.channel`,
                                                                        newItem,
                                                                    );
                                                                }}
                                                                shouldDismissPopover={
                                                                    true
                                                                }
                                                            />
                                                        );
                                                    },
                                                }}
                                            />
                                            <Tooltip
                                                multiline
                                                maw={300}
                                                withArrow
                                                label="If delivering to a private Slack channel, please type the name of the channel in the input box exactly as it appears in Slack. Also ensure you invite the Lightdash Slackbot into that channel."
                                            >
                                                <Box mt={7}>
                                                    <MantineIcon
                                                        icon={IconInfoCircle}
                                                        color="gray.6"
                                                    />
                                                </Box>
                                            </Tooltip>
                                            <Button
                                                minimal={true}
                                                icon={'cross'}
                                                onClick={() => {
                                                    remove(index);
                                                    setShowDestinationLabel(
                                                        true,
                                                    );
                                                }}
                                                disabled={disabled}
                                            />
                                        </TargetRow>
                                    );
                                } else {
                                    // Email
                                    return (
                                        <TargetRow key={key}>
                                            <EmailIcon
                                                size={20}
                                                color={Colors.GRAY1}
                                            />
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
                                                onClick={() => {
                                                    remove(index);
                                                    setShowDestinationLabel(
                                                        true,
                                                    );
                                                }}
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
                                        hoverCloseDelay={500}
                                        content={
                                            <>
                                                {SlackErrorContent({
                                                    slackState,
                                                })}
                                            </>
                                        }
                                        position="bottom"
                                        disabled={
                                            slackState === SlackStates.SUCCESS
                                        }
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
                                                    : () =>
                                                          append({
                                                              channel: '',
                                                          })
                                            }
                                            icon={'plus'}
                                            text="Add slack"
                                        />
                                    </Tooltip2>
                                    <Tooltip2
                                        interactionKind="hover"
                                        hoverCloseDelay={500}
                                        content={
                                            <>
                                                <p>
                                                    No Email integration found
                                                </p>
                                                <p>
                                                    To create an email scheduled
                                                    delivery, you need to add
                                                    <Anchor
                                                        target="_blank"
                                                        href="https://docs.lightdash.com/references/environmentVariables"
                                                    >
                                                        {' '}
                                                        SMTP environment
                                                        variables{' '}
                                                    </Anchor>
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
                                                    : () =>
                                                          append({
                                                              recipients: '',
                                                          })
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
                    </InlinedInputs>
                </InputGroupWrapper>
            </FormGroup>
        </Form>
    );
};

export default SchedulerForm;
