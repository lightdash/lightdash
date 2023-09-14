import { Button, Classes, Colors, FormGroup } from '@blueprintjs/core';
import { MenuItem2, Tooltip2 } from '@blueprintjs/popover2';
import {
    CreateSchedulerAndTargetsWithoutIds,
    Field,
    fieldId as getFieldId,
    getItemMap,
    isField,
    TableCalculation,
} from '@lightdash/common';
import { Anchor, Box, Flex, Select, TextInput, Tooltip } from '@mantine/core';
import { FC, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import useHealth from '../../../hooks/health/useHealth';

import { IconInfoCircle } from '@tabler/icons-react';
import { useSlackChannels } from '../../../hooks/slack/useSlackChannels';
import { useExplore } from '../../../hooks/useExplore';
import { useGetSlack } from '../../../hooks/useSlack';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import MantineIcon from '../../common/MantineIcon';
import { ArrayInput } from '../../ReactHookForm/ArrayInput';
import AutoComplete from '../../ReactHookForm/AutoComplete';
import {
    InlinedInputs,
    InlinedLabel,
} from '../../ReactHookForm/CronInput/CronInput.styles';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import { hasRequiredScopes } from '../../UserSettings/SlackSettingsPanel';
import {
    EmailIcon,
    SlackIcon,
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
                    To create a slack threshold alert, you need to
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

const SchedulerForm: FC<{
    resourceUuid: string;
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

    //const isImageDisabled = !health.data?.hasHeadlessBrowser;
    /*
    const format = methods.watch(
        'format',
        isImageDisabled ? SchedulerFormat.CSV : SchedulerFormat.IMAGE,
    );*/

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    /*
    const queryResults = useExplorerContext(
        (context) => context.queryResults.data,
    );*/

    const { data: exploreData } = useExplore(tableName);
    /*

    const selectedItemIds = useMemo(() => {
        return savedChart
            ? itemsInMetricQuery(savedChart.metricQuery)
            : undefined;
    }, [savedChart]);*/
    //TODO filter chart fields
    const itemsMap = useMemo(() => {
        if (!exploreData) return {};

        return getItemMap(
            exploreData,
            savedChart?.metricQuery.additionalMetrics,
            savedChart?.metricQuery.tableCalculations,
        );
    }, [exploreData, savedChart]);

    const [selectedField, setSelectedField] = useState<
        Field | TableCalculation
    >();
    // const fields = savedChart?.metricQuery.dimensions
    return (
        <Form name="scheduler" methods={methods}>
            <FormGroup label={<Title>2. Set the threshold</Title>}>
                <FieldAutoComplete
                    activeField={selectedField}
                    name="threshold.fieldId"
                    fields={Object.values(itemsMap)}
                    onChange={(value) => {
                        setSelectedField(value);

                        methods.setValue(
                            'threshold.fieldId',
                            isField(value) ? getFieldId(value) : value.name,
                        );
                    }}
                />
                <Flex align="center" gap="sm">
                    <Select
                        label="operation"
                        defaultValue={'greater_than'}
                        data={[
                            { value: 'greater_than', label: 'Is greater than' },
                            { value: 'less_than', label: 'Is less than' },
                            { value: 'increase_by', label: 'Has increased by' },
                            { value: 'decrease_by', label: 'Has decreased by' },
                        ]}
                        {...methods.register('threshold.operator')}
                        onChange={(s) => {
                            if (s) methods.setValue('threshold.operator', s);
                        }}
                    />
                    <TextInput
                        label="value"
                        {...methods.register('threshold.value')}
                    />
                </Flex>
            </FormGroup>
            <FormGroup>
                <Title>5. Add destination(s)</Title>

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
                                    isPrivateChannel && target.channel !== ''
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
                                                setShowDestinationLabel(true);
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
                                                setShowDestinationLabel(true);
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
                                            <p>No Email integration found</p>
                                            <p>
                                                To create an email scheduled
                                                delivery, you need to add
                                                <Anchor
                                                    target="_blank"
                                                    href="https://docs.lightdash.com/references/environmentVariables"
                                                >
                                                    {' '}
                                                    SMTP environment variables{' '}
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
            </FormGroup>
        </Form>
    );
};

export default SchedulerForm;
