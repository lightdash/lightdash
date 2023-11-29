import {
    CreateSchedulerAndTargetsWithoutIds,
    CreateSchedulerTarget,
    isDashboardScheduler,
    isSchedulerCsvOptions,
    isSchedulerImageOptions,
    isSlackTarget,
    SchedulerAndTargets,
    SchedulerFormat,
    validateEmail,
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
    Space,
    Stack,
    Tabs,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconChevronDown,
    IconChevronUp,
    IconMail,
    IconSettings,
} from '@tabler/icons-react';
import MDEditor, { commands } from '@uiw/react-md-editor';
import { FC, useCallback, useMemo, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { TagInput } from '../../../components/common/TagInput/TagInput';
import { CronInternalInputs } from '../../../components/ReactHookForm/CronInput';
import { hasRequiredScopes } from '../../../components/UserSettings/SlackSettingsPanel';
import { useDashboardQuery } from '../../../hooks/dashboard/useDashboard';
import useHealth from '../../../hooks/health/useHealth';
import { useSlackChannels } from '../../../hooks/slack/useSlackChannels';
import { useGetSlack } from '../../../hooks/useSlack';
import { ReactComponent as SlackSvg } from '../../../svgs/slack.svg';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';
import SchedulerFilters from './SchedulerFilters';
import SchedulersModalFooter from './SchedulerModalFooter';

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
    options: {
        formatted: Values.FORMATTED,
        limit: Limit.TABLE,
        customLimit: 1,
        withPdf: false,
    },
    emailTargets: [] as string[],
    slackTargets: [] as string[],
    filters: undefined,
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
        options: formOptions,
        emailTargets: emailTargets,
        slackTargets: slackTargets,
        ...(isDashboardScheduler(schedulerData) && {
            filters: schedulerData.filters,
        }),
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
                    <Anchor href="/generalSettings/integrations/slack">
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
}) => {
    const form = useForm({
        initialValues:
            savedSchedulerData !== undefined
                ? getFormValuesFromScheduler(savedSchedulerData)
                : DEFAULT_VALUES,
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
                options,
                targets,
                ...(resource?.type === 'dashboard' && {
                    filters: values.filters,
                }),
            };
        },
    });
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

    const isDashboard = resource && resource.type === 'dashboard';
    const { data: dashboard } = useDashboardQuery(resource?.uuid, {
        enabled: isDashboard,
    });

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

    const slackChannels = useMemo(() => {
        return (slackChannelsQuery.data || [])
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
    }, [slackChannelsQuery.data, privateChannels]);

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
                    <Tabs.Tab value="customization">Customization</Tabs.Tab>
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
                            label="Delivery name"
                            placeholder="Name your delivery"
                            required
                            {...form.getInputProps('name')}
                        />
                        <Input.Wrapper label="Delivery frequency">
                            <Box mt="xxs">
                                <CronInternalInputs
                                    disabled={disabled}
                                    {...form.getInputProps('cron')}
                                    name="cron"
                                />
                            </Box>
                        </Input.Wrapper>
                        <Stack spacing={0}>
                            <Input.Label mb="xxs"> Format </Input.Label>
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
                                    {...form.getInputProps('options.withPdf', {
                                        type: 'checkbox',
                                    })}
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
                                            <MantineIcon icon={IconSettings} />
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
                                                <Stack spacing="xxs" pt="xs">
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
                                                        withinPortal
                                                        value={
                                                            form.values
                                                                .slackTargets
                                                        }
                                                        rightSection={
                                                            slackChannelsQuery.isLoading ?? (
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
                    <Text m="md">Customize delivery message body</Text>

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
                </Tabs.Panel>
            </Tabs>

            <SchedulersModalFooter
                confirmText={confirmText}
                onBack={onBack}
                onSendNow={handleSendNow}
                loading={loading}
            />
        </form>
    );
};

export default SchedulerForm;
