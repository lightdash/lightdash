import {
    NotificationFrequency,
    SchedulerFormat,
    ThresholdOperator,
    formatMinutesOffset,
    getItemId,
    getTzMinutesOffset,
    validateEmail,
    type CustomDimension,
    type Dashboard,
    type Field,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Checkbox,
    Collapse,
    Group,
    HoverCard,
    Input,
    MultiSelect,
    NumberInput,
    Radio,
    SegmentedControl,
    Select,
    Space,
    Stack,
    TagsInput,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconHelpCircle,
    IconMail,
    IconPercentage,
    IconSettings,
} from '@tabler/icons-react';
import isEqual from 'lodash/isEqual';
import { useMemo, useState, type FC } from 'react';
import { CronInternalInputs } from '../../../../components/ReactHookForm/CronInput';
import FieldSelect from '../../../../components/common/FieldSelect';
import FilterNumberInput from '../../../../components/common/Filters/FilterInputs/FilterNumberInput';
import MantineIcon from '../../../../components/common/MantineIcon';
import { SlackChannelSelect } from '../../../../components/common/SlackChannelSelect';
import TimeZonePicker from '../../../../components/common/TimeZonePicker';
import useHealth from '../../../../hooks/health/useHealth';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import { useActiveProjectUuid } from '../../../../hooks/useActiveProject';
import { useProject } from '../../../../hooks/useProject';
import SlackSvg from '../../../../svgs/slack.svg?react';
import { Limit, SlackStates, Values } from '../types';
import { SchedulerFormMicrosoftTeamsInput } from './SchedulerFormMicrosoftTeamsInput';
import { SchedulerFormSlackError } from './SchedulerFormSlackError';
import { useSchedulerFormContext } from './schedulerFormContext';

const thresholdOperatorOptions = [
    { label: 'is greater than', value: ThresholdOperator.GREATER_THAN },
    { label: 'is less than', value: ThresholdOperator.LESS_THAN },
    { label: 'increased by', value: ThresholdOperator.INCREASED_BY },
    { label: 'decreased by', value: ThresholdOperator.DECREASED_BY },
];

type Props = {
    dashboard: Dashboard | undefined;
    isThresholdAlert: boolean;
    isThresholdAlertWithNoFields: boolean | undefined;
    numericMetrics: Record<
        string,
        TableCalculation | Metric | Field | CustomDimension
    >;
    isDashboardTabsAvailable: boolean;
};

export const SchedulerFormSetupTab: FC<Props> = ({
    dashboard,
    isThresholdAlert,
    isThresholdAlertWithNoFields,
    numericMetrics,
    isDashboardTabsAvailable,
}) => {
    const form = useSchedulerFormContext();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);
    const health = useHealth();
    const { data: slackInstallation, isInitialLoading } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    const slackState = useMemo(() => {
        if (isInitialLoading) return SlackStates.LOADING;
        if (!organizationHasSlack) return SlackStates.NO_SLACK;
        if (!slackInstallation.hasRequiredScopes)
            return SlackStates.MISSING_SCOPES;
        return SlackStates.SUCCESS;
    }, [isInitialLoading, organizationHasSlack, slackInstallation]);

    const [allTabsSelected, setAllTabsSelected] = useState(
        form.values.selectedTabs === null ||
            isEqual(
                dashboard?.tabs.map((tab) => tab.uuid),
                form.values.selectedTabs,
            ), // make sure tab ids are identical
    );

    const [emailValidationError, setEmailValidationError] = useState<
        string | undefined
    >();
    const [showFormatting, setShowFormatting] = useState(false);

    const isAddSlackDisabled = slackState !== SlackStates.SUCCESS;
    const isAddEmailDisabled = !health.data?.hasEmailClient;
    const isImageDisabled = !health.data?.hasHeadlessBrowser;

    const limit = form.values?.options?.limit;

    const projectDefaultOffsetString = useMemo(() => {
        if (!project) {
            return;
        }
        const minsOffset = getTzMinutesOffset('UTC', project.schedulerTimezone);
        return formatMinutesOffset(minsOffset);
    }, [project]);

    return (
        <Stack gap="xl" px="md">
            <TextInput
                label={isThresholdAlert ? 'Alert name' : 'Delivery name'}
                placeholder={
                    isThresholdAlert ? 'Name your alert' : 'Name your delivery'
                }
                required
                {...form.getInputProps('name')}
            />
            {isThresholdAlert && (
                <Stack gap="xs">
                    <FieldSelect
                        label="Alert field"
                        required
                        disabled={isThresholdAlertWithNoFields}
                        withinPortal
                        hasGrouping
                        items={Object.values(numericMetrics)}
                        data-testid="Alert/FieldSelect"
                        {...{
                            // TODO: the field select doesn't work great
                            // with use form, so we provide our own on change and value here.
                            // The field select wants Items, but the form wants strings.
                            // We could definitely make this easier to work with
                            ...form.getInputProps(`thresholds.0.field`),
                            item: Object.values(numericMetrics).find(
                                (metric) =>
                                    getItemId(metric) ===
                                    form.values?.thresholds?.[0]?.fieldId,
                            ),
                            onChange: (value) => {
                                if (!value) return;
                                form.setFieldValue(
                                    'thresholds.0.fieldId',
                                    getItemId(value),
                                );
                            },
                        }}
                    />
                    {isThresholdAlertWithNoFields && (
                        <Text color="red" size="xs" mb="sm">
                            No numeric fields available. You must have at least
                            one numeric metric or calculation to set an alert.
                        </Text>
                    )}
                    <Group wrap="nowrap" grow>
                        <Select
                            label="Condition"
                            data={thresholdOperatorOptions}
                            {...form.getInputProps(`thresholds.0.operator`)}
                        />
                        <FilterNumberInput
                            label="Threshold"
                            size="sm"
                            {...form.getInputProps(`thresholds.0.value`)}
                            onChange={(value) => {
                                form.setFieldValue(
                                    'thresholds.0.value',
                                    value || '',
                                );
                            }}
                            value={form.values.thresholds?.[0]?.value}
                            rightSection={
                                (form.values.thresholds?.[0]?.operator ===
                                    ThresholdOperator.INCREASED_BY ||
                                    form.values.thresholds?.[0]?.operator ===
                                        ThresholdOperator.DECREASED_BY) && (
                                    <MantineIcon
                                        icon={IconPercentage}
                                        size="lg"
                                        color="blue.4"
                                    />
                                )
                            }
                        />
                    </Group>

                    <Stack gap="xs" mt="xs">
                        <Checkbox
                            label="Notify me only once"
                            {...{
                                ...form.getInputProps('notificationFrequency'),
                                checked:
                                    'notificationFrequency' in form.values &&
                                    form.values.notificationFrequency ===
                                        NotificationFrequency.ONCE,
                                onChange: (e) => {
                                    form.setFieldValue(
                                        'notificationFrequency',
                                        e.target.checked
                                            ? NotificationFrequency.ONCE
                                            : NotificationFrequency.ALWAYS,
                                    );
                                },
                            }}
                        />
                        {'notificationFrequency' in form.values &&
                            form.values.notificationFrequency ===
                                NotificationFrequency.ALWAYS && (
                                <Text size="xs" c="ldGray.6" fs="italic">
                                    You will be notified at the specified
                                    frequency whenever the threshold conditions
                                    are met
                                </Text>
                            )}
                    </Stack>
                </Stack>
            )}
            <Input.Wrapper
                label={
                    isThresholdAlert ? 'Run frequency' : 'Delivery frequency'
                }
            >
                {isThresholdAlert && (
                    <Tooltip
                        withinPortal
                        maw={400}
                        multiline
                        label=" This is the frequency at which Lightdash runs a query to check your data for changes. (You will be notified if the conditions on the latest value are met) "
                        position="top"
                    >
                        <MantineIcon
                            icon={IconHelpCircle}
                            size="md"
                            display="inline"
                            color="gray"
                            style={{
                                marginLeft: '4px',
                                marginBottom: '-4px',
                            }}
                        />
                    </Tooltip>
                )}
                <Box w="100%">
                    <CronInternalInputs
                        disabled={false}
                        {...form.getInputProps('cron')}
                        value={form.values.cron}
                        name="cron"
                    >
                        <TimeZonePicker
                            size="sm"
                            style={{ flexGrow: 1 }}
                            placeholder={`Project Default ${
                                projectDefaultOffsetString
                                    ? `(UTC ${projectDefaultOffsetString})`
                                    : ''
                            }`}
                            maw={350}
                            searchable
                            clearable
                            variant="default"
                            {...form.getInputProps('timezone')}
                        />
                    </CronInternalInputs>
                </Box>
            </Input.Wrapper>
            {!isThresholdAlert && (
                <Stack gap={0}>
                    <Input.Label> Format </Input.Label>
                    <Group gap="xs" wrap="nowrap">
                        <SegmentedControl
                            radius="md"
                            data={[
                                {
                                    label: '.csv',
                                    value: SchedulerFormat.CSV,
                                },
                                {
                                    label: '.xlsx',
                                    value: SchedulerFormat.XLSX,
                                },
                                {
                                    label: 'Image',
                                    value: SchedulerFormat.IMAGE,
                                    disabled: isImageDisabled,
                                },
                            ]}
                            w="50%"
                            {...form.getInputProps('format')}
                        />
                        {isImageDisabled && (
                            <Text
                                size="xs"
                                c="ldGray.6"
                                w="30%"
                                style={{ alignSelf: 'start' }}
                            >
                                You must enable the
                                <Anchor href="https://docs.lightdash.com/self-host/customize-deployment/enable-headless-browser-for-lightdash">
                                    {' '}
                                    headless browser{' '}
                                </Anchor>
                                to send images
                            </Text>
                        )}
                    </Group>
                    <Space h="xxs" />
                    {form.getInputProps('format').value ===
                    SchedulerFormat.IMAGE ? (
                        <Checkbox
                            h={26}
                            label="Also include image as PDF attachment"
                            labelPosition="left"
                            {...form.getInputProps('options.withPdf', {
                                type: 'checkbox',
                            })}
                        />
                    ) : (
                        <Stack gap="xs">
                            {form.values.format === SchedulerFormat.CSV && (
                                <Tooltip
                                    label="You must have at least one email target to attach a file to emails"
                                    position="top"
                                    withinPortal
                                    disabled={
                                        (form.values.emailTargets?.length || 0) > 0
                                    }
                                >
                                    <Box display="flex" w="fit-content">
                                        <Checkbox
                                            label="Attach file to emails"
                                            labelPosition="left"
                                            {...form.getInputProps(
                                                'options.asAttachment',
                                                {
                                                    type: 'checkbox',
                                                },
                                            )}
                                            disabled={
                                                (form.values.emailTargets
                                                    ?.length || 0) === 0
                                            }
                                        />
                                    </Box>
                                </Tooltip>
                            )}
                            <Button
                                variant="subtle"
                                size="compact-sm"
                                style={{
                                    alignSelf: 'start',
                                }}
                                leftSection={
                                    <MantineIcon icon={IconSettings} />
                                }
                                rightSection={
                                    <MantineIcon
                                        icon={
                                            showFormatting
                                                ? IconChevronUp
                                                : IconChevronDown
                                        }
                                    />
                                }
                                onClick={() => setShowFormatting((old) => !old)}
                            >
                                Formatting options
                            </Button>
                            <Collapse in={showFormatting} pl="md">
                                <Group align="start" gap="xxl">
                                    <Radio.Group
                                        label="Values"
                                        {...form.getInputProps(
                                            'options.formatted',
                                        )}
                                    >
                                        <Stack gap="xxs" pt="xs">
                                            <Radio
                                                label="Formatted"
                                                value={Values.FORMATTED}
                                            />
                                            <Radio
                                                label="Raw"
                                                value={Values.RAW}
                                            />
                                        </Stack>
                                    </Radio.Group>
                                    <Stack gap="xs">
                                        <Radio.Group
                                            label="Limit"
                                            {...form.getInputProps(
                                                'options.limit',
                                            )}
                                        >
                                            <Stack gap="xxs" pt="xs">
                                                <Radio
                                                    label="Results in Table"
                                                    value={Limit.TABLE}
                                                />
                                                <Radio
                                                    label="All Results"
                                                    value={Limit.ALL}
                                                />
                                                <Radio
                                                    label="Custom..."
                                                    value={Limit.CUSTOM}
                                                />
                                            </Stack>
                                        </Radio.Group>
                                        {limit === Limit.CUSTOM && (
                                            <NumberInput
                                                w={150}
                                                min={1}
                                                required
                                                {...form.getInputProps(
                                                    'options.customLimit',
                                                )}
                                            />
                                        )}

                                        {(form.values?.options?.limit ===
                                            Limit.ALL ||
                                            form.values?.options?.limit ===
                                                Limit.CUSTOM) && (
                                            <i>
                                                Results are limited to{' '}
                                                {Number(
                                                    health.data?.query
                                                        .csvCellsLimit ||
                                                        100000,
                                                ).toLocaleString()}{' '}
                                                cells for each file
                                            </i>
                                        )}
                                    </Stack>
                                </Group>
                            </Collapse>
                        </Stack>
                    )}
                </Stack>
            )}

            {isDashboardTabsAvailable && !isThresholdAlert && (
                <Stack gap={10}>
                    <Input.Label>
                        Tabs
                        <Tooltip
                            withinPortal={true}
                            maw={400}
                            multiline
                            label="Select all tabs to include all tabs in the delivery. If you don't select this option, only selected tab will be included in the delivery."
                        >
                            <MantineIcon
                                icon={IconHelpCircle}
                                size="md"
                                display="inline"
                                color="gray"
                                style={{
                                    marginLeft: '4px',
                                    marginBottom: '-4px',
                                }}
                            />
                        </Tooltip>
                    </Input.Label>
                    <Checkbox
                        size="xs"
                        label="Include all tabs"
                        labelPosition="right"
                        checked={allTabsSelected}
                        onChange={(e) => {
                            setAllTabsSelected((old) => !old);
                            form.setFieldValue(
                                'selectedTabs',
                                e.target.checked ? null : [],
                            );
                        }}
                    />
                    {!allTabsSelected && (
                        <MultiSelect
                            placeholder="Select tabs to include in the delivery"
                            value={form.values.selectedTabs ?? undefined}
                            error={
                                form.errors.selectedTabs
                                    ? 'Selected tabs should not be empty'
                                    : undefined
                            }
                            data={(dashboard?.tabs || []).map((tab) => ({
                                value: tab.uuid,
                                label: tab.name,
                            }))}
                            searchable
                            onChange={(val) => {
                                form.setFieldValue('selectedTabs', val);
                            }}
                        />
                    )}
                </Stack>
            )}

            <Input.Wrapper label="Destinations">
                <Stack>
                    <Group wrap="nowrap">
                        <MantineIcon
                            icon={IconMail}
                            size="xl"
                            color="ldGray.7"
                        />
                        <HoverCard
                            disabled={!isAddEmailDisabled}
                            width={300}
                            position="bottom-start"
                            shadow="md"
                        >
                            <HoverCard.Target>
                                <Box w="100%">
                                    <TagsInput
                                        radius="md"
                                        clearable
                                        error={emailValidationError || null}
                                        placeholder="Enter email addresses"
                                        disabled={isAddEmailDisabled}
                                        value={form.values.emailTargets || []}
                                        allowDuplicates={false}
                                        splitChars={[',', ' ']}
                                        onBlur={() =>
                                            setEmailValidationError(undefined)
                                        }
                                        onChange={(val: string[]) => {
                                            const added = val.filter(
                                                (v) =>
                                                    !(
                                                        form.values
                                                            .emailTargets || []
                                                    ).includes(v),
                                            );
                                            const invalid = added.find(
                                                (v) => !validateEmail(v),
                                            );

                                            if (invalid) {
                                                setEmailValidationError(
                                                    `'${invalid}' doesn't appear to be an email address`,
                                                );
                                                // Only add the valid ones from the new set
                                                form.setFieldValue(
                                                    'emailTargets',
                                                    val.filter(validateEmail),
                                                );
                                                return;
                                            }

                                            setEmailValidationError(undefined);
                                            form.setFieldValue(
                                                'emailTargets',
                                                val,
                                            );
                                        }}
                                    />
                                </Box>
                            </HoverCard.Target>
                            <HoverCard.Dropdown>
                                <>
                                    <Text fz="xs" fw={500}>
                                        No Email integration found.
                                    </Text>
                                    <Text fz="xs">
                                        To create an email scheduled delivery,
                                        you need to add
                                        <Anchor
                                            fz="xs"
                                            fw={500}
                                            target="_blank"
                                            href="https://docs.lightdash.com/self-host/customize-deployment/configure-smtp-for-lightdash-email-notifications"
                                        >
                                            {' '}
                                            SMTP environment variables{' '}
                                        </Anchor>
                                        to your Lightdash instance
                                    </Text>
                                </>
                            </HoverCard.Dropdown>
                        </HoverCard>
                    </Group>
                    <Stack
                        gap="xs"
                        mb={health.data?.hasMicrosoftTeams ? '0' : 'sm'}
                    >
                        <Group wrap="nowrap">
                            <SlackSvg
                                style={{
                                    margin: '5px 2px',
                                    width: '20px',
                                    height: '20px',
                                }}
                            />
                            <HoverCard
                                disabled={!isAddSlackDisabled}
                                width={300}
                                position="bottom-start"
                                shadow="md"
                            >
                                <HoverCard.Target>
                                    <Box w="100%">
                                        <SlackChannelSelect
                                            multiple
                                            size="sm"
                                            placeholder="Search slack channels"
                                            value={form.values.slackTargets}
                                            disabled={isAddSlackDisabled}
                                            includeDms
                                            onChange={(val) => {
                                                form.setFieldValue(
                                                    'slackTargets',
                                                    val,
                                                );
                                            }}
                                        />
                                    </Box>
                                </HoverCard.Target>
                                <HoverCard.Dropdown>
                                    <SchedulerFormSlackError
                                        slackState={slackState}
                                    />
                                </HoverCard.Dropdown>
                            </HoverCard>
                        </Group>
                        {!isAddSlackDisabled && (
                            <Text size="xs" color="ldGray.6" ml="3xl">
                                If delivering to a private Slack channel, please
                                type the name of the channel in the input box
                                exactly as it appears in Slack. Also ensure you
                                invite the Lightdash Slackbot into that channel.
                            </Text>
                        )}
                    </Stack>
                    {health.data?.hasMicrosoftTeams && (
                        <SchedulerFormMicrosoftTeamsInput
                            msTeamTargets={form.values.msTeamsTargets}
                            onChange={(val: string[]) => {
                                form.setFieldValue('msTeamsTargets', val);
                            }}
                        />
                    )}
                </Stack>
            </Input.Wrapper>
        </Stack>
    );
};
