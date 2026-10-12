import {
    AGENT_IDENTITY_SOURCES,
    type AiIdentitySource,
    type OrganizationAgentIdentityRule,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Divider,
    Group,
    HoverCard,
    Loader,
    Popover,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconAlertTriangleFilled,
    IconArrowRight,
    IconCheck,
    IconCircleCheckFilled,
    IconKey,
    IconRobot,
    IconUser,
} from '@tabler/icons-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { getWarehouseIcon } from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import classes from './AgentIdentityChip.module.css';
import {
    identityChoiceStateLabels,
    identityLabels,
    identityWarehouseNames,
} from './identityLabels';

const sourceIcons = {
    marked_person: IconUser,
    ai_service_account: IconRobot,
    agent_sign_in: IconKey,
};

const MissingAccounts = ({
    projects,
}: {
    projects: NonNullable<
        OrganizationAgentIdentityRule['projectsMissingAiServiceAccount']
    >;
}) => {
    const title = `${projects.length} ${projects.length === 1 ? 'project has' : 'projects have'} no shared agent account`;
    return (
        <Stack gap="xs" role="region" aria-label={title}>
            <Group gap="xs" wrap="nowrap">
                <MantineIcon icon={IconAlertTriangleFilled} color="orange" />
                <Text size="sm" fw={500} c="orange">
                    {title}
                </Text>
            </Group>
            <Text size="sm" c="dimmed">
                {projects.length === 1
                    ? 'Agents are refused on it until a project admin adds one.'
                    : 'Agents are refused on them until a project admin adds one.'}
            </Text>
            <Divider />
            {projects.map((project) => (
                <Anchor
                    key={project.projectUuid}
                    component={Link}
                    size="sm"
                    to={`/generalSettings/projectManagement/${project.projectUuid}/agentIdentity`}
                >
                    <Group justify="space-between">
                        {project.name}
                        <MantineIcon icon={IconArrowRight} />
                    </Group>
                </Anchor>
            ))}
        </Stack>
    );
};

const MissingAccountsStatus = ({
    projects,
    warehouseName,
    canEdit,
    onWarningHover,
}: {
    projects: NonNullable<
        OrganizationAgentIdentityRule['projectsMissingAiServiceAccount']
    >;
    warehouseName: string;
    canEdit: boolean;
    onWarningHover: (hovered: boolean) => void;
}) => {
    const [opened, setOpened] = useState(false);
    const label = `${warehouseName}: ${projects.length} ${projects.length === 1 ? 'project has' : 'projects have'} no shared agent account`;
    const count = (
        <Badge
            component={canEdit ? 'span' : 'button'}
            type={canEdit ? undefined : 'button'}
            className={canEdit ? undefined : classes.warningButton}
            color="orange"
            variant="light"
            onMouseEnter={() => onWarningHover(true)}
            onMouseLeave={() => onWarningHover(false)}
            role={canEdit ? 'status' : undefined}
            aria-label={label}
            leftSection={
                <MantineIcon icon={IconAlertTriangleFilled} size="xs" />
            }
            onClick={canEdit ? undefined : () => setOpened((value) => !value)}
        >
            {projects.length}
        </Badge>
    );
    if (!canEdit)
        return (
            <Popover
                opened={opened}
                onChange={setOpened}
                position="bottom-start"
                width={420}
                withArrow
                trapFocus
                returnFocus
            >
                <Popover.Target>{count}</Popover.Target>
                <Popover.Dropdown className={classes.popover}>
                    <MissingAccounts projects={projects} />
                </Popover.Dropdown>
            </Popover>
        );
    return (
        <HoverCard width={420} position="bottom" withArrow withinPortal>
            <HoverCard.Target>{count}</HoverCard.Target>
            <HoverCard.Dropdown
                className={classes.popover}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ')
                        event.stopPropagation();
                }}
                onKeyUp={(event) => {
                    if (event.key === 'Enter' || event.key === ' ')
                        event.stopPropagation();
                }}
            >
                <MissingAccounts projects={projects} />
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

const ChipStatus = ({
    rule,
    verificationStatus,
    canEdit,
    onWarningHover,
}: {
    rule: OrganizationAgentIdentityRule;
    canEdit: boolean;
    verificationStatus: 'verified' | 'attention' | null;
    onWarningHover: (hovered: boolean) => void;
}) => {
    const warehouseName =
        identityWarehouseNames[
            rule.warehouseType as keyof typeof identityWarehouseNames
        ];
    const missing =
        rule.source === 'ai_service_account'
            ? rule.projectsMissingAiServiceAccount
            : null;
    const warning = missing && missing.length > 0 ? missing : null;
    if (warning)
        return (
            <MissingAccountsStatus
                projects={warning}
                warehouseName={warehouseName}
                canEdit={canEdit}
                onWarningHover={onWarningHover}
            />
        );
    if (missing?.length === 0)
        return (
            <MantineIcon
                icon={IconCircleCheckFilled}
                color="green"
                aria-hidden={false}
                role="status"
                aria-label={`Every ${warehouseName} project has a shared agent account.`}
            />
        );
    if (rule.source === 'agent_sign_in' && verificationStatus)
        return (
            <MantineIcon
                icon={
                    verificationStatus === 'verified'
                        ? IconCircleCheckFilled
                        : IconAlertTriangleFilled
                }
                color={verificationStatus === 'verified' ? 'green' : 'orange'}
                aria-hidden={false}
                role="status"
                aria-label={`Snowflake agent sign-in ${verificationStatus === 'verified' ? 'verified' : 'needs attention'}`}
            />
        );
    return null;
};

const ChipContent = ({
    rule,
    saving,
    verificationStatus,
    canEdit,
    onWarningHover,
}: {
    rule: OrganizationAgentIdentityRule;
    canEdit: boolean;
    saving: boolean;
    verificationStatus: 'verified' | 'attention' | null;
    onWarningHover: (hovered: boolean) => void;
}) => {
    const warehouseName =
        identityWarehouseNames[
            rule.warehouseType as keyof typeof identityWarehouseNames
        ];
    const identity = identityLabels[rule.source];
    return (
        <>
            {getWarehouseIcon(rule.warehouseType, 20)}
            <Text component="span" size="sm" fw={500}>
                {warehouseName}
            </Text>
            <Divider orientation="vertical" className={classes.divider} />
            {saving ? (
                <Loader
                    size="xs"
                    role="status"
                    aria-label={`Saving ${warehouseName} identity`}
                />
            ) : (
                <MantineIcon
                    icon={sourceIcons[rule.source]}
                    color={
                        rule.source === 'marked_person' ? 'dimmed' : undefined
                    }
                    aria-hidden={false}
                    role="img"
                    aria-label={identity.label}
                />
            )}
            {identity.shortLabel && (
                <Text component="span" size="sm" fw={500}>
                    {identity.shortLabel}
                </Text>
            )}
            <ChipStatus
                rule={rule}
                canEdit={canEdit}
                verificationStatus={verificationStatus}
                onWarningHover={onWarningHover}
            />
        </>
    );
};

export const AgentIdentityChip = ({
    rule,
    configured,
    canEdit,
    saving,
    verificationStatus,
    setupExpanded,
    settingUpSource,
    onToggleSetup,
    onSelect,
}: {
    rule: OrganizationAgentIdentityRule;
    configured: boolean;
    canEdit: boolean;
    saving: boolean;
    verificationStatus: 'verified' | 'attention' | null;
    setupExpanded: boolean;
    settingUpSource: AiIdentitySource | null;
    onToggleSetup: (() => void) | null;
    onSelect: (source: AiIdentitySource) => void;
}) => {
    const [opened, setOpened] = useState(false);
    const [warningHovered, setWarningHovered] = useState(false);
    const headerId = useId();
    const warehouseName =
        identityWarehouseNames[
            rule.warehouseType as keyof typeof identityWarehouseNames
        ];
    const identity = identityLabels[rule.source];
    const missing =
        rule.source === 'ai_service_account'
            ? rule.projectsMissingAiServiceAccount
            : null;
    const warning = missing && missing.length > 0 ? missing : null;
    const label = `${warehouseName}: agents run as ${identity.label.toLowerCase()}.${canEdit ? ' Change.' : ''}`;
    const tooltip = `${warehouseName}: ${identity.tooltip}${canEdit ? ' Click to change.' : ''}`;
    const content = (
        <ChipContent
            rule={rule}
            canEdit={canEdit}
            saving={saving}
            verificationStatus={verificationStatus}
            onWarningHover={setWarningHovered}
        />
    );
    if (!canEdit)
        return (
            <Tooltip
                label={tooltip}
                position="bottom-start"
                disabled={warningHovered}
                multiline
                w={300}
                withArrow
            >
                <Group className={classes.chip} role="group" aria-label={label}>
                    {content}
                </Group>
            </Tooltip>
        );
    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="bottom-start"
            width={400}
            withArrow
            trapFocus
            returnFocus
        >
            <Tooltip
                label={tooltip}
                position="bottom-start"
                events={{ hover: true, focus: true, touch: false }}
                disabled={opened || warningHovered}
                multiline
                w={300}
                withArrow
            >
                <Popover.Target>
                    <UnstyledButton
                        className={classes.chip}
                        aria-label={label}
                        disabled={saving}
                        onClick={() => setOpened((value) => !value)}
                    >
                        {content}
                    </UnstyledButton>
                </Popover.Target>
            </Tooltip>
            <Popover.Dropdown
                className={classes.popover}
                aria-labelledby={headerId}
            >
                <Stack gap="xs">
                    {warning && <MissingAccounts projects={warning} />}
                    <Text id={headerId} size="xs" c="dimmed" fw={500}>
                        {warehouseName} agents run as
                    </Text>
                    <Stack gap={0}>
                        {AGENT_IDENTITY_SOURCES[rule.warehouseType].person.map(
                            (source) => {
                                const settingUp = source === settingUpSource;
                                const stateLabel = settingUp
                                    ? identityChoiceStateLabels.settingUp
                                    : settingUpSource !== null &&
                                        source === rule.source
                                      ? identityChoiceStateLabels.current
                                      : null;
                                return (
                                    <UnstyledButton
                                        key={source}
                                        className={classes.choice}
                                        aria-label={
                                            stateLabel
                                                ? `${identityLabels[source].label}, ${stateLabel.toLowerCase()}`
                                                : identityLabels[source].label
                                        }
                                        data-setting-up={settingUp || undefined}
                                        aria-current={
                                            source === rule.source
                                                ? 'true'
                                                : undefined
                                        }
                                        onClick={() => {
                                            setOpened(false);
                                            onSelect(source);
                                        }}
                                    >
                                        <Box
                                            className={classes.iconTile}
                                            flex="0 0 auto"
                                        >
                                            <MantineIcon
                                                icon={sourceIcons[source]}
                                            />
                                        </Box>
                                        <Stack gap={0} flex={1}>
                                            <Group gap="xs">
                                                <Text size="sm" fw={500}>
                                                    {
                                                        identityLabels[source]
                                                            .label
                                                    }
                                                </Text>
                                                {stateLabel && (
                                                    <Badge
                                                        size="xs"
                                                        variant={
                                                            settingUp
                                                                ? 'light'
                                                                : 'outline'
                                                        }
                                                        color={
                                                            settingUp
                                                                ? 'blue'
                                                                : 'ldGray.4'
                                                        }
                                                        c={
                                                            settingUp
                                                                ? undefined
                                                                : 'ldGray.7'
                                                        }
                                                    >
                                                        {stateLabel}
                                                    </Badge>
                                                )}
                                                {source === 'agent_sign_in' &&
                                                    !configured &&
                                                    !settingUp && (
                                                        <Badge size="xs">
                                                            Setup needed
                                                        </Badge>
                                                    )}
                                            </Group>
                                            <Text size="xs" c="dimmed">
                                                {
                                                    identityLabels[source]
                                                        .description
                                                }
                                            </Text>
                                        </Stack>
                                        {settingUpSource === null &&
                                            source === rule.source && (
                                                <MantineIcon
                                                    icon={IconCheck}
                                                    aria-hidden={false}
                                                    role="img"
                                                    aria-label="Saved choice"
                                                />
                                            )}
                                    </UnstyledButton>
                                );
                            },
                        )}
                    </Stack>
                    {onToggleSetup && (
                        <UnstyledButton
                            className={classes.choice}
                            onClick={() => {
                                setOpened(false);
                                onToggleSetup();
                            }}
                        >
                            <Text size="sm">
                                {setupExpanded ? 'Hide setup' : 'View setup'}
                            </Text>
                        </UnstyledButton>
                    )}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
