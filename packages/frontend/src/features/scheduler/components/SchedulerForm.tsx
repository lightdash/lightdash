import {
    FeatureFlags,
    formatMinutesOffset,
    getItemId,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    getTzMinutesOffset,
    isDashboardScheduler,
    isNumericItem,
    isSchedulerCsvOptions,
    isSchedulerImageOptions,
    isSlackTarget,
    NotificationFrequency,
    SchedulerFormat,
    ThresholdOperator,
    validateEmail,
    type CreateSchedulerAndTargetsWithoutIds,
    type CreateSchedulerTarget,
    type Dashboard,
    type ItemsMap,
    type SchedulerAndTargets,
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
    Loader,
    MultiSelect,
    NumberInput,
    Radio,
    SegmentedControl,
    Select,
    Space,
    Stack,
    Switch,
    Tabs,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconChevronDown,
    IconChevronUp,
    IconHelpCircle,
    IconInfoCircle,
    IconMail,
    IconPercentage,
    IconSettings,
} from '@tabler/icons-react';
import MDEditor, { commands } from '@uiw/react-md-editor';
import { debounce, intersection, isEqual } from 'lodash';
import { useCallback, useMemo, useState, type FC } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import FilterNumberInput from '../../../components/common/Filters/FilterInputs/FilterNumberInput';
import MantineIcon from '../../../components/common/MantineIcon';
import { TagInput } from '../../../components/common/TagInput/TagInput';
import TimeZonePicker from '../../../components/common/TimeZonePicker';
import { CronInternalInputs } from '../../../components/ReactHookForm/CronInput';
import { hasRequiredScopes } from '../../../components/UserSettings/SlackSettingsPanel';
import { useDashboardQuery } from '../../../hooks/dashboard/useDashboard';
import useHealth from '../../../hooks/health/useHealth';
import { useGetSlack, useSlackChannels } from '../../../hooks/slack/useSlack';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { useProject } from '../../../hooks/useProject';
import SlackSvg from '../../../svgs/slack.svg?react';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';
import SchedulerFilters from './SchedulerFilters';
import SchedulersModalFooter from './SchedulerModalFooter';
import { SchedulerPreview } from './SchedulerPreview';

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

const DEFAULT_VALUES = {
    name: '',
    message: '',
    format: SchedulerFormat.CSV,
    cron: '0 9 * * 1',
    timezone: undefined,
    options: {
        formatted: Values.FORMATTED,
        limit: Limit.TABLE,
        customLimit: 1,
        withPdf: false,
    },
    emailTargets: [] as string[],
    slackTargets: [] as string[],
    filters: undefined,
    customViewportWidth: undefined,
    selectedTabs: undefined,
    thresholds: [],
    includeLinks: true,
};

const DEFAULT_VALUES_ALERT = {
    ...DEFAULT_VALUES,
    format: SchedulerFormat.IMAGE,
    cron: '0 10 * * *',
    thresholds: [
        {
            fieldId: '',
            operator: ThresholdOperator.GREATER_THAN,
            value: 0,
        },
    ],
    notificationFrequency: NotificationFrequency.ONCE,
};

const MAX_SLACK_CHANNELS = 100000;

const thresholdOperatorOptions = [
    { label: 'is greater than', value: ThresholdOperator.GREATER_THAN },
    { label: 'is less than', value: ThresholdOperator.LESS_THAN },
    { label: 'increased by', value: ThresholdOperator.INCREASED_BY },
    { label: 'decreased by', value: ThresholdOperator.DECREASED_BY },
];

const getSelectedTabsForDashboardScheduler = (
    schedulerData: SchedulerAndTargets,
    isDashboardTabsAvailable: boolean,
    dashboard: Dashboard | undefined,
) => {
    return (
        isDashboardScheduler(schedulerData) && {
            selectedTabs: isDashboardTabsAvailable
                ? intersection(
                      schedulerData.selectedTabs,
                      dashboard?.tabs.map((tab) => tab.uuid),
                  )
                : undefined, // remove tabs that have been deleted
        }
    );
};

const getFormValuesFromScheduler = (schedulerData: SchedulerAndTargets) => {
    const options = schedulerData.options;

    const formOptions = DEFAULT_VALUES.options;

    if (isSchedulerCsvOptions(options)) {
        formOptions.formatted = options.formatted
            ? Values.FORMATTED
            : Values.RAW;
        formOptions.limit =
            options.limit === Limit.TABLE
                ? Limit.TABLE
                : options.limit === Limit.ALL
                ? Limit.ALL
                : Limit.CUSTOM;
        if (formOptions.limit === Limit.CUSTOM) {
            formOptions.customLimit = options.limit as number;
        }
    } else if (isSchedulerImageOptions(options)) {
        formOptions.withPdf = options.withPdf || false;
    }

    const emailTargets: string[] = [];
    const slackTargets: string[] = [];

    schedulerData.targets.forEach((target) => {
        if (isSlackTarget(target)) {
            slackTargets.push(target.channel);
        } else {
            emailTargets.push(target.recipient);
        }
    });

    return {
        name: schedulerData.name,
        message: schedulerData.message,
        format: schedulerData.format,
        cron: schedulerData.cron,
        timezone: schedulerData.timezone,
        options: formOptions,
        emailTargets: emailTargets,
        slackTargets: slackTargets,
        ...(isDashboardScheduler(schedulerData) && {
            filters: schedulerData.filters,
            customViewportWidth: schedulerData.customViewportWidth,
            selectedTabs: schedulerData.selectedTabs,
        }),
        thresholds: schedulerData.thresholds,
        notificationFrequency: schedulerData.notificationFrequency,
        includeLinks: schedulerData.includeLinks !== false,
    };
};

const SlackErrorContent: FC<{ slackState: SlackStates }> = ({ slackState }) => {
    if (slackState === SlackStates.NO_SLACK) {
        return (
            <>
                <Text pb="sm">No Slack integration found</Text>
                <Text>
                    To create a slack scheduled delivery, you need to
                    <Anchor
                        target="_blank"
                        href="https://docs.lightdash.com/self-host/customize-deployment/configure-a-slack-app-for-lightdash"
                    >
                        {' '}
                        setup Slack{' '}
                    </Anchor>
                    for your Lightdash instance
                </Text>
            </>
        );
    } else if (slackState === SlackStates.MISSING_SCOPES) {
        return (
            <>
                <Text pb="sm">Slack integration needs to be reinstalled</Text>
                <Text>
                    To create a slack scheduled delivery, you need to
                    <Anchor href="/generalSettings/integrations">
                        {' '}
                        reinstall the Slack integration{' '}
                    </Anchor>
                    for your organization
                </Text>
            </>
        );
    }
    return <></>;
};

type Props = {
    disabled: boolean;
    savedSchedulerData?: SchedulerAndTargets;
    resource?: {
        uuid: string;
        type: 'chart' | 'dashboard';
    };
    onSubmit: (data: any) => void;
    onSendNow: (data: CreateSchedulerAndTargetsWithoutIds) => void;
    onBack?: () => void;
    loading?: boolean;
    confirmText?: string;
    isThresholdAlert?: boolean;
    itemsMap?: ItemsMap;
};

const SchedulerForm: FC<Props> = ({
    disabled,
    resource,
    savedSchedulerData,
    onSubmit,
    onSendNow,
    onBack,
    loading,
    confirmText,
    isThresholdAlert,
    itemsMap,
}) => {
    const isDashboard = resource && resource.type === 'dashboard';
    const isDashboardTabsEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardTabs,
    );
    const { data: dashboard } = useDashboardQuery(resource?.uuid, {
        enabled: isDashboard,
    });

    const isDashboardTabsAvailable =
        dashboard?.tabs !== undefined && dashboard.tabs.length > 0;

    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);

    const form = useForm({
        initialValues:
            savedSchedulerData !== undefined
                ? getFormValuesFromScheduler({
                      ...savedSchedulerData,
                      ...getSelectedTabsForDashboardScheduler(
                          savedSchedulerData,
                          isDashboardTabsAvailable,
                          dashboard,
                      ),
                  })
                : isThresholdAlert
                ? DEFAULT_VALUES_ALERT
                : {
                      ...DEFAULT_VALUES,
                      selectedTabs: isDashboardTabsAvailable
                          ? dashboard?.tabs.map((tab) => tab.uuid)
                          : undefined,
                  },
        validateInputOnBlur: ['options.customLimit'],

        validate: {
            name: (value) => {
                return value.length > 0 ? null : 'Name is required';
            },
            options: {
                customLimit: (value, values) => {
                    return values.options.limit === Limit.CUSTOM &&
                        !Number.isInteger(value)
                        ? 'Custom limit must be an integer'
                        : null;
                },
            },
            cron: (cronExpression) => {
                return isInvalidCronExpression('Cron expression')(
                    cronExpression,
                );
            },
        },

        transformValues: (values): CreateSchedulerAndTargetsWithoutIds => {
            let options = {};
            if (values.format === SchedulerFormat.CSV) {
                options = {
                    formatted: values.options.formatted,
                    limit:
                        values.options.limit === Limit.CUSTOM
                            ? values.options.customLimit
                            : values.options.limit,
                };
            } else if (values.format === SchedulerFormat.IMAGE) {
                options = {
                    withPdf: values.options.withPdf,
                };
            }

            const emailTargets = values.emailTargets.map((email: string) => ({
                recipient: email,
            }));

            const slackTargets = values.slackTargets.map(
                (channelId: string) => ({
                    channel: channelId,
                }),
            );

            const targets: CreateSchedulerTarget[] = [
                ...emailTargets,
                ...slackTargets,
            ];
            return {
                name: values.name,
                message: values.message,
                format: values.format,
                cron: values.cron,
                timezone: values.timezone,
                options,
                targets,
                ...(resource?.type === 'dashboard' && {
                    filters: values.filters,
                    customViewportWidth: values.customViewportWidth,
                    selectedTabs: values.selectedTabs,
                }),
                thresholds: values.thresholds,
                enabled: true,
                notificationFrequency:
                    'notificationFrequency' in values
                        ? (values.notificationFrequency as NotificationFrequency)
                        : undefined,
                includeLinks: values.includeLinks !== false,
            };
        },
    });

    const [allTabsSelected, setAllTabsSelected] = useState(
        isEqual(
            dashboard?.tabs.map((tab) => tab.uuid),
            form.values.selectedTabs,
        ), // make sure tab ids are identical
    );

    const health = useHealth();
    const [emailValidationError, setEmailValidationError] = useState<
        string | undefined
    >();
    const [privateChannels, setPrivateChannels] = useState<
        Array<{
            label: string;
            value: string;
            group: 'Private channels';
        }>
    >([]);

    const [showFormatting, setShowFormatting] = useState(false);

    const [search, setSearch] = useState('');

    const debounceSetSearch = debounce((val) => setSearch(val), 500);

    const numericMetrics = {
        ...getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem),
        ...getTableCalculationsFromItemsMap(itemsMap),
    };

    const { data: slackInstallation, isInitialLoading } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    const slackState = useMemo(() => {
        if (isInitialLoading) return SlackStates.LOADING;
        if (!organizationHasSlack) return SlackStates.NO_SLACK;
        if (!hasRequiredScopes(slackInstallation))
            return SlackStates.MISSING_SCOPES;
        return SlackStates.SUCCESS;
    }, [isInitialLoading, organizationHasSlack, slackInstallation]);

    const slackChannelsQuery = useSlackChannels(search, {
        enabled: organizationHasSlack,
    });

    const slackChannels = useMemo(() => {
        return (slackChannelsQuery?.data || [])
            .map((channel) => {
                const channelPrefix = channel.name.charAt(0);

                return {
                    value: channel.id,
                    label: channel.name,
                    group:
                        channelPrefix === '#'
                            ? 'Channels'
                            : channelPrefix === '@'
                            ? 'Users'
                            : 'Private channels',
                };
            })
            .concat(privateChannels);
    }, [slackChannelsQuery?.data, privateChannels]);

    let responsiveChannelsSearchEnabled =
        slackChannels.length >= MAX_SLACK_CHANNELS || search.length > 0; // enable responvive channel search if there are more than MAX_SLACK_CHANNELS defined channels

    const handleSendNow = useCallback(() => {
        if (form.isValid()) {
            onSendNow(form.getTransformedValues(form.values));
        } else {
            form.validate();
        }
    }, [form, onSendNow]);

    const isAddSlackDisabled = disabled || slackState !== SlackStates.SUCCESS;
    const isAddEmailDisabled = disabled || !health.data?.hasEmailClient;
    const isImageDisabled = !health.data?.hasHeadlessBrowser;

    const limit = form.values?.options?.limit;

    const isThresholdAlertWithNoFields =
        isThresholdAlert && Object.keys(numericMetrics).length === 0;

    const projectDefaultOffsetString = useMemo(() => {
        if (!project) {
            return;
        }
        const minsOffset = getTzMinutesOffset('UTC', project.schedulerTimezone);
        return formatMinutesOffset(minsOffset);
    }, [project]);

    return (
        <form onSubmit={form.onSubmit((values) => onSubmit(values))}>
            <Tabs defaultValue="setup">
                <Tabs.List mt="sm" mb={0}>
                    <Tabs.Tab value="setup" ml="md">
                        Setup
                    </Tabs.Tab>
                    {isDashboard && dashboard ? (
                        <Tabs.Tab value="filters">Filters</Tabs.Tab>
                    ) : null}

                    {!isThresholdAlert && (
                        <>
                            <Tabs.Tab value="customization">
                                {isThresholdAlert
                                    ? 'Alert message'
                                    : 'Customization'}
                            </Tabs.Tab>
                            <Tabs.Tab
                                disabled={
                                    form.values.format !==
                                        SchedulerFormat.IMAGE || !isDashboard
                                }
                                value="preview"
                            >
                                Preview and Size
                            </Tabs.Tab>
                        </>
                    )}
                </Tabs.List>

                <Tabs.Panel value="setup" mt="md">
                    <Stack
                        sx={(theme) => ({
                            backgroundColor: theme.white,
                            paddingRight: theme.spacing.xl,
                        })}
                        spacing="xl"
                        px="md"
                    >
                        <TextInput
                            label={
                                isThresholdAlert
                                    ? 'Alert name'
                                    : 'Delivery name'
                            }
                            placeholder={
                                isThresholdAlert
                                    ? 'Name your alert'
                                    : 'Name your delivery'
                            }
                            required
                            {...form.getInputProps('name')}
                        />
                        {isThresholdAlert && (
                            <Stack spacing="xs">
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
                                        ...form.getInputProps(
                                            `thresholds.0.field`,
                                        ),
                                        item: Object.values(
                                            numericMetrics,
                                        ).find(
                                            (metric) =>
                                                getItemId(metric) ===
                                                form.values?.thresholds?.[0]
                                                    ?.fieldId,
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
                                        No numeric fields available. You must
                                        have at least one numeric metric or
                                        calculation to set an alert.
                                    </Text>
                                )}
                                <Group noWrap grow>
                                    <Select
                                        label="Condition"
                                        data={thresholdOperatorOptions}
                                        {...form.getInputProps(
                                            `thresholds.0.operator`,
                                        )}
                                    />
                                    <FilterNumberInput
                                        label="Threshold"
                                        size="sm"
                                        {...form.getInputProps(
                                            `thresholds.0.value`,
                                        )}
                                        onChange={(value) => {
                                            form.setFieldValue(
                                                'thresholds.0.value',
                                                value || '',
                                            );
                                        }}
                                        value={
                                            form.values.thresholds?.[0]?.value
                                        }
                                        rightSection={
                                            (form.values.thresholds?.[0]
                                                ?.operator ===
                                                ThresholdOperator.INCREASED_BY ||
                                                form.values.thresholds?.[0]
                                                    ?.operator ===
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

                                <Stack spacing="xs" mt="xs">
                                    <Checkbox
                                        label="Notify me only once"
                                        {...{
                                            ...form.getInputProps(
                                                'notificationFrequency',
                                            ),
                                            checked:
                                                'notificationFrequency' in
                                                    form.values &&
                                                form.values
                                                    .notificationFrequency ===
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
                                            <Text
                                                size="xs"
                                                color="gray.6"
                                                fs="italic"
                                            >
                                                You will be notified at the
                                                specified frequency whenever the
                                                threshold conditions are met
                                            </Text>
                                        )}
                                </Stack>
                            </Stack>
                        )}
                        <Input.Wrapper
                            label={
                                isThresholdAlert
                                    ? 'Run frequency'
                                    : 'Delivery frequency'
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
                                    disabled={disabled}
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
                            <Stack spacing={0}>
                                <Input.Label> Format </Input.Label>
                                <Group spacing="xs" noWrap>
                                    <SegmentedControl
                                        data={[
                                            {
                                                label: '.csv',
                                                value: SchedulerFormat.CSV,
                                            },
                                            {
                                                label: 'Image',
                                                value: SchedulerFormat.IMAGE,
                                                disabled: isImageDisabled,
                                            },
                                        ]}
                                        w="50%"
                                        mb="xs"
                                        {...form.getInputProps('format')}
                                    />
                                    {isImageDisabled && (
                                        <Text
                                            size="xs"
                                            color="gray.6"
                                            w="30%"
                                            sx={{ alignSelf: 'start' }}
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
                                        {...form.getInputProps(
                                            'options.withPdf',
                                            {
                                                type: 'checkbox',
                                            },
                                        )}
                                    />
                                ) : (
                                    <Stack spacing="xs">
                                        <Button
                                            variant="subtle"
                                            compact
                                            sx={{
                                                alignSelf: 'start',
                                            }}
                                            leftIcon={
                                                <MantineIcon
                                                    icon={IconSettings}
                                                />
                                            }
                                            rightIcon={
                                                <MantineIcon
                                                    icon={
                                                        showFormatting
                                                            ? IconChevronUp
                                                            : IconChevronDown
                                                    }
                                                />
                                            }
                                            onClick={() =>
                                                setShowFormatting((old) => !old)
                                            }
                                        >
                                            Formatting options
                                        </Button>
                                        <Collapse in={showFormatting} pl="md">
                                            <Group align="start" spacing="xxl">
                                                <Radio.Group
                                                    label="Values"
                                                    {...form.getInputProps(
                                                        'options.formatted',
                                                    )}
                                                >
                                                    <Stack
                                                        spacing="xxs"
                                                        pt="xs"
                                                    >
                                                        <Radio
                                                            label="Formatted"
                                                            value={
                                                                Values.FORMATTED
                                                            }
                                                        />
                                                        <Radio
                                                            label="Raw"
                                                            value={Values.RAW}
                                                        />
                                                    </Stack>
                                                </Radio.Group>
                                                <Stack spacing="xs">
                                                    <Radio.Group
                                                        label="Limit"
                                                        {...form.getInputProps(
                                                            'options.limit',
                                                        )}
                                                    >
                                                        <Stack
                                                            spacing="xxs"
                                                            pt="xs"
                                                        >
                                                            <Radio
                                                                label="Results in Table"
                                                                value={
                                                                    Limit.TABLE
                                                                }
                                                            />
                                                            <Radio
                                                                label="All Results"
                                                                value={
                                                                    Limit.ALL
                                                                }
                                                            />
                                                            <Radio
                                                                label="Custom..."
                                                                value={
                                                                    Limit.CUSTOM
                                                                }
                                                            />
                                                        </Stack>
                                                    </Radio.Group>
                                                    {limit === Limit.CUSTOM && (
                                                        <NumberInput
                                                            w={150}
                                                            min={1}
                                                            precision={0}
                                                            required
                                                            {...form.getInputProps(
                                                                'options.customLimit',
                                                            )}
                                                        />
                                                    )}

                                                    {(form.values?.options
                                                        ?.limit === Limit.ALL ||
                                                        form.values?.options
                                                            ?.limit ===
                                                            Limit.CUSTOM) && (
                                                        <i>
                                                            Results are limited
                                                            to{' '}
                                                            {Number(
                                                                health.data
                                                                    ?.query
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

                        {isDashboardTabsEnabled &&
                            isDashboardTabsAvailable &&
                            !isThresholdAlert && (
                                <Stack spacing={10}>
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
                                                e.target.checked
                                                    ? dashboard?.tabs.map(
                                                          (tab) => tab.uuid,
                                                      )
                                                    : [],
                                            );
                                        }}
                                    />
                                    {!allTabsSelected && (
                                        <MultiSelect
                                            placeholder="Select tabs to include in the delivery"
                                            value={form.values.selectedTabs}
                                            data={(dashboard?.tabs || []).map(
                                                (tab) => ({
                                                    value: tab.uuid,
                                                    label: tab.name,
                                                }),
                                            )}
                                            searchable
                                            onChange={(val) => {
                                                form.setFieldValue(
                                                    'selectedTabs',
                                                    val,
                                                );
                                            }}
                                        />
                                    )}
                                </Stack>
                            )}

                        <Input.Wrapper label="Destinations">
                            <Stack mt="sm">
                                <Group noWrap>
                                    <MantineIcon
                                        icon={IconMail}
                                        size="xl"
                                        color="gray.7"
                                    />
                                    <HoverCard
                                        disabled={!isAddEmailDisabled}
                                        width={300}
                                        position="bottom-start"
                                        shadow="md"
                                    >
                                        <HoverCard.Target>
                                            <Box w="100%">
                                                <TagInput
                                                    clearable
                                                    error={
                                                        emailValidationError ||
                                                        null
                                                    }
                                                    placeholder="Enter email addresses"
                                                    disabled={
                                                        isAddEmailDisabled
                                                    }
                                                    value={
                                                        form.values.emailTargets
                                                    }
                                                    allowDuplicates={false}
                                                    splitChars={[',', ' ']}
                                                    validationFunction={
                                                        validateEmail
                                                    }
                                                    onBlur={() =>
                                                        setEmailValidationError(
                                                            undefined,
                                                        )
                                                    }
                                                    onValidationReject={(val) =>
                                                        setEmailValidationError(
                                                            `'${val}' doesn't appear to be an email address`,
                                                        )
                                                    }
                                                    onChange={(val) => {
                                                        setEmailValidationError(
                                                            undefined,
                                                        );
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
                                                <Text pb="sm">
                                                    No Email integration found
                                                </Text>
                                                <Text>
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
                                                </Text>
                                            </>
                                        </HoverCard.Dropdown>
                                    </HoverCard>
                                </Group>
                                <Stack spacing="xs" mb="sm">
                                    <Group noWrap>
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
                                                    <MultiSelect
                                                        placeholder="Search slack channels"
                                                        data={slackChannels}
                                                        searchable
                                                        creatable
                                                        limit={500}
                                                        withinPortal
                                                        value={
                                                            form.values
                                                                .slackTargets
                                                        }
                                                        rightSection={
                                                            slackChannelsQuery?.isInitialLoading ?? (
                                                                <Loader size="sm" />
                                                            )
                                                        }
                                                        disabled={
                                                            isAddSlackDisabled
                                                        }
                                                        getCreateLabel={(
                                                            query,
                                                        ) =>
                                                            `Send to private channel #${query}`
                                                        }
                                                        onCreate={(newItem) => {
                                                            setPrivateChannels(
                                                                (current) => [
                                                                    ...current,
                                                                    {
                                                                        label: newItem,
                                                                        value: newItem,
                                                                        group: 'Private channels',
                                                                    },
                                                                ],
                                                            );
                                                            return newItem;
                                                        }}
                                                        onSearchChange={(
                                                            val,
                                                        ) => {
                                                            if (
                                                                responsiveChannelsSearchEnabled
                                                            ) {
                                                                debounceSetSearch(
                                                                    val,
                                                                );
                                                            }
                                                        }}
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
                                                <SlackErrorContent
                                                    slackState={slackState}
                                                />
                                            </HoverCard.Dropdown>
                                        </HoverCard>
                                    </Group>
                                    {!isAddSlackDisabled && (
                                        <Text size="xs" color="gray.6" ml="3xl">
                                            If delivering to a private Slack
                                            channel, please type the name of the
                                            channel in the input box exactly as
                                            it appears in Slack. Also ensure you
                                            invite the Lightdash Slackbot into
                                            that channel.
                                        </Text>
                                    )}
                                </Stack>
                            </Stack>
                        </Input.Wrapper>
                    </Stack>
                </Tabs.Panel>

                {isDashboard && dashboard ? (
                    <Tabs.Panel value="filters" p="md">
                        <SchedulerFilters
                            dashboard={dashboard}
                            schedulerFilters={form.values.filters}
                            onChange={(schedulerFilters) => {
                                form.setFieldValue('filters', schedulerFilters);
                            }}
                        />
                    </Tabs.Panel>
                ) : null}

                <Tabs.Panel value="customization">
                    <Stack p="md">
                        <Group>
                            <Switch
                                label="Include links to Lightdash"
                                checked={form.values.includeLinks}
                                onChange={() =>
                                    form.setFieldValue(
                                        'includeLinks',
                                        !form.values?.includeLinks,
                                    )
                                }
                            ></Switch>
                            <Tooltip
                                label={`Include links to the shared content in your Lightdash project. \n
                                                                 We recommend turning this off if you're sharing with users who do not have access to your Lightdash project`}
                                multiline
                                withinPortal
                                position="right"
                                maw={400}
                            >
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    color="gray.6"
                                />
                            </Tooltip>
                        </Group>
                        <Text fw={600}>Customize delivery message body</Text>

                        <MDEditor
                            preview="edit"
                            commands={[
                                commands.bold,
                                commands.italic,
                                commands.strikethrough,
                                commands.divider,
                                commands.link,
                            ]}
                            value={form.values.message}
                            onChange={(value) =>
                                form.setFieldValue('message', value || '')
                            }
                        />
                    </Stack>
                </Tabs.Panel>
                {isDashboard && dashboard ? (
                    <Tabs.Panel value="preview">
                        <SchedulerPreview
                            schedulerFilters={form.values.filters}
                            dashboard={dashboard}
                            customViewportWidth={
                                form.values.customViewportWidth
                            }
                            onChange={(customViewportWidth) => {
                                form.setFieldValue(
                                    'customViewportWidth',
                                    customViewportWidth
                                        ? parseInt(customViewportWidth)
                                        : undefined,
                                );
                            }}
                        />
                    </Tabs.Panel>
                ) : null}
            </Tabs>

            <SchedulersModalFooter
                confirmText={confirmText}
                disableConfirm={isThresholdAlertWithNoFields}
                onBack={onBack}
                canSendNow={Boolean(
                    form.values.slackTargets.length ||
                        form.values.emailTargets.length,
                )}
                onSendNow={isThresholdAlert ? undefined : handleSendNow}
                loading={loading}
            />
        </form>
    );
};

export default SchedulerForm;
