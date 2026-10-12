import {
    WarehouseTypes,
    type OrganizationAgentIdentityOverview,
    type OrganizationAgentIdentityRule,
    type OrganizationProject,
    type AiIdentitySource,
} from '@lightdash/common';
import { Box, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { AgentIdentityChip } from './AgentIdentityChip';
import classes from './AgentIdentityChip.module.css';
import AgentIdentityRuleConfirmModal from './AgentIdentityRuleConfirmModal';
import {
    useSnowflakeAgentSetup,
    useSnowflakeAgentVerify,
    useUpdateOrganizationAgentIdentityRule,
} from './api';
import { identityWarehouseNames } from './identityLabels';
import { SnowflakeAgentSetup } from './SnowflakeAgentSetup';

const getVerificationStatus = (
    verify: ReturnType<typeof useSnowflakeAgentVerify>,
) => {
    if (verify.isFetching) return null;
    if (verify.isError || verify.data?.passed === false) return 'attention';
    return verify.data?.passed === true ? 'verified' : null;
};

const AgentIdentityRule = ({
    rule,
    configured,
    canEdit,
    setupLoading,
}: {
    rule: OrganizationAgentIdentityRule;
    configured: boolean;
    canEdit: boolean;
    setupLoading: boolean;
}) => {
    const save = useUpdateOrganizationAgentIdentityRule();
    const [pending, setPending] = useState(false);
    const [expanded, setExpanded] = useState<boolean | null>(null);
    const [pendingSource, setPendingSource] = useState<Exclude<
        AiIdentitySource,
        'agent_sign_in'
    > | null>(null);
    const active =
        rule.warehouseType === WarehouseTypes.SNOWFLAKE &&
        rule.source === 'agent_sign_in';
    const verify = useSnowflakeAgentVerify(active && canEdit);
    const needsAttention = verify.isError || verify.data?.passed === false;
    const setupExpanded = expanded ?? (needsAttention && !setupLoading);
    return (
        <>
            <AgentIdentityChip
                rule={rule}
                configured={configured}
                canEdit={canEdit}
                saving={save.isLoading}
                verificationStatus={getVerificationStatus(verify)}
                setupExpanded={setupExpanded}
                onToggleSetup={
                    active ? () => setExpanded(!setupExpanded) : null
                }
                onSelect={(source) => {
                    if (!canEdit || save.isLoading) return;
                    if (
                        source === 'agent_sign_in' &&
                        rule.warehouseType === WarehouseTypes.SNOWFLAKE &&
                        !active
                    ) {
                        setPending(true);
                        return;
                    }
                    setPending(false);
                    if (source !== rule.source && source !== 'agent_sign_in')
                        setPendingSource(source);
                }}
            />
            {canEdit && pendingSource && (
                <AgentIdentityRuleConfirmModal
                    warehouseType={rule.warehouseType}
                    source={pendingSource}
                    saving={save.isLoading}
                    onClose={() => {
                        if (!save.isLoading) setPendingSource(null);
                    }}
                    onConfirm={() =>
                        save.mutate(
                            {
                                warehouseType: rule.warehouseType,
                                source: pendingSource,
                            },
                            { onSuccess: () => setPendingSource(null) },
                        )
                    }
                />
            )}
            {canEdit &&
                rule.warehouseType === WarehouseTypes.SNOWFLAKE &&
                (pending ? (
                    <Box className={classes.setup}>
                        <SnowflakeAgentSetup
                            key="pending"
                            mode="pending"
                            saving={save.isLoading}
                            onCancel={() => setPending(false)}
                            onTurnOn={() =>
                                save.mutate(
                                    {
                                        warehouseType: rule.warehouseType,
                                        source: 'agent_sign_in',
                                    },
                                    { onSuccess: () => setPending(false) },
                                )
                            }
                        />
                    </Box>
                ) : active ? (
                    <Box className={classes.setup}>
                        <SnowflakeAgentSetup
                            key="active"
                            mode="active"
                            verify={verify}
                            expanded={expanded}
                            onToggle={() => setExpanded(!setupExpanded)}
                        />
                    </Box>
                ) : null)}
        </>
    );
};

const ActiveSnowflakeAgentIdentityRule = (
    props: Omit<Parameters<typeof AgentIdentityRule>[0], 'setupLoading'>,
) => {
    const setup = useSnowflakeAgentSetup();
    return <AgentIdentityRule {...props} setupLoading={setup.isLoading} />;
};

export const OrganizationAgentIdentityCard = ({
    overview,
    projects,
    canEdit,
}: {
    overview: OrganizationAgentIdentityOverview;
    projects: Pick<OrganizationProject, 'warehouseType'>[];
    canEdit: boolean;
}) => {
    const [shownWarehouses, setShownWarehouses] = useState<Set<WarehouseTypes>>(
        () => new Set(),
    );
    const warehouses = new Set(
        projects.map((project) => project.warehouseType),
    );
    const rules = overview.rules.filter(
        (rule) =>
            rule.warehouseType in identityWarehouseNames &&
            (warehouses.has(rule.warehouseType) ||
                rule.source !== 'marked_person' ||
                shownWarehouses.has(rule.warehouseType)),
    );
    if (rules.some((rule) => !shownWarehouses.has(rule.warehouseType))) {
        setShownWarehouses(
            new Set([
                ...shownWarehouses,
                ...rules.map((rule) => rule.warehouseType),
            ]),
        );
    }
    return (
        <SettingsCard>
            <Stack gap="md">
                <Title order={5}>Identity</Title>
                {rules.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        No warehouses in use yet.
                    </Text>
                ) : (
                    <Group gap="xs">
                        {rules.map((rule) =>
                            rule.warehouseType === WarehouseTypes.SNOWFLAKE &&
                            rule.source === 'agent_sign_in' &&
                            canEdit ? (
                                <ActiveSnowflakeAgentIdentityRule
                                    key={`${rule.warehouseType}-${rule.source}`}
                                    rule={rule}
                                    configured={overview.snowflakeConfigured}
                                    canEdit={canEdit}
                                />
                            ) : (
                                <AgentIdentityRule
                                    key={`${rule.warehouseType}-${rule.source}`}
                                    rule={rule}
                                    configured={overview.snowflakeConfigured}
                                    canEdit={canEdit}
                                    setupLoading={false}
                                />
                            ),
                        )}
                    </Group>
                )}
            </Stack>
        </SettingsCard>
    );
};
