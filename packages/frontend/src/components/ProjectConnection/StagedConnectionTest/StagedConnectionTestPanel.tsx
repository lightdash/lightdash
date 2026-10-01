import {
    getWarehouseConnectionDocsUrl,
    isLocalHost,
    WarehouseConnectionFailureCause,
    WarehouseConnectionTestStageStatus,
    WarehouseTypes,
    type WarehouseConnectionStagedTestResults,
    type WarehouseConnectionTestFailure,
    type WarehouseGrantSuggestion,
} from '@lightdash/common';
import {
    Accordion,
    Anchor,
    Badge,
    Button,
    Code,
    Group,
    List,
    Loader,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { IconCheck, IconMinus, IconX, type Icon } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { Link, useLocation } from 'react-router';
import Callout from '../../common/Callout';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import MantineIcon from '../../common/MantineIcon';
import { useFormContext } from '../formContext';
import {
    CAUSE_COPY,
    getAccessMessage,
    LOCAL_HOST_NETWORK_NEXT_STEP,
    SSL_MODE_DESCRIPTIONS,
    STAGE_LABELS,
    STAGE_STATUS_LABELS,
} from './stagedConnectionTestCopy';

const SLOW_TEST_AFTER_MS = 8000;
const INVITE_AFTER_SAME_FAILURES = 2;

const STATUS_ICONS: Record<
    WarehouseConnectionTestStageStatus,
    { icon: Icon; color: string }
> = {
    [WarehouseConnectionTestStageStatus.PASSED]: {
        icon: IconCheck,
        color: 'green',
    },
    [WarehouseConnectionTestStageStatus.FAILED]: { icon: IconX, color: 'red' },
    [WarehouseConnectionTestStageStatus.NOT_CHECKED_SEPARATELY]: {
        icon: IconMinus,
        color: 'ldGray.6',
    },
    [WarehouseConnectionTestStageStatus.NOT_RUN]: {
        icon: IconMinus,
        color: 'ldGray.4',
    },
};

const StageList: FC<{ results: WarehouseConnectionStagedTestResults }> = ({
    results,
}) => (
    <List spacing={4} size="sm" listStyleType="none">
        {results.stages.map(({ stage, status }) => (
            <List.Item
                key={stage}
                icon={
                    <MantineIcon
                        icon={STATUS_ICONS[status].icon}
                        color={STATUS_ICONS[status].color}
                    />
                }
            >
                {STAGE_LABELS[stage]}
                {status !== WarehouseConnectionTestStageStatus.PASSED && (
                    <Text span size="sm" c="dimmed">
                        {' '}
                        · {STAGE_STATUS_LABELS[status]}
                    </Text>
                )}
            </List.Item>
        ))}
    </List>
);

const RunningState: FC<{ host: string | null }> = ({ host }) => {
    const [isSlow, setIsSlow] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setIsSlow(true), SLOW_TEST_AFTER_MS);
        return () => clearTimeout(timer);
    }, []);
    return (
        <Group gap="xs">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
                {isSlow && host
                    ? `Still trying to reach ${host}…`
                    : 'Testing the connection…'}
            </Text>
        </Group>
    );
};

const GrantSuggestion: FC<{ suggestion: WarehouseGrantSuggestion }> = ({
    suggestion,
}) => (
    <Stack gap="xs">
        <Group gap="xs">
            <Badge size="sm">{suggestion.label}</Badge>
            <Text size="sm">{suggestion.explanation}</Text>
        </Group>
        {suggestion.statements.length > 0 && (
            <Group align="flex-start" gap="xs" wrap="nowrap">
                <Code block flex={1}>
                    {suggestion.statements.join('\n')}
                </Code>
                <CopyActionIcon
                    value={suggestion.statements.join('\n')}
                    copyLabel="Copy statements"
                    variant="subtle"
                />
            </Group>
        )}
    </Stack>
);

const TlsChoice: FC<{ warehouseType: WarehouseTypes }> = ({
    warehouseType,
}) => {
    const form = useFormContext();
    if (
        warehouseType !== WarehouseTypes.POSTGRES &&
        warehouseType !== WarehouseTypes.REDSHIFT
    ) {
        return null;
    }
    const { warehouse } = form.values;
    const sslmode =
        warehouse.type === WarehouseTypes.POSTGRES ||
        warehouse.type === WarehouseTypes.REDSHIFT
            ? warehouse.sslmode
            : undefined;
    const selected = SSL_MODE_DESCRIPTIONS.find(
        ({ value }) => value === sslmode,
    );
    return (
        <Select
            label="SSL mode"
            allowDeselect={false}
            data={SSL_MODE_DESCRIPTIONS.map(({ value }) => value)}
            description={selected?.description}
            {...form.getInputProps('warehouse.sslmode')}
        />
    );
};

const FoldedDetails: FC<{ details: string }> = ({ details }) =>
    details ? (
        <Accordion variant="contained">
            <Accordion.Item value="details">
                <Accordion.Control>
                    <Text size="sm">Details</Text>
                </Accordion.Control>
                <Accordion.Panel>
                    <Code block>{details}</Code>
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    ) : null;

const FailureCallout: FC<{
    warehouseType: WarehouseTypes;
    results: WarehouseConnectionStagedTestResults;
    failure: WarehouseConnectionTestFailure;
    sameCauseFailureCount: number;
}> = ({ warehouseType, results, failure, sameCauseFailureCount }) => {
    const { pathname } = useLocation();
    const copy = CAUSE_COPY[failure.cause];
    const isNetwork =
        failure.cause === WarehouseConnectionFailureCause.NETWORK ||
        failure.cause === WarehouseConnectionFailureCause.TIMEOUT;
    const nextStep =
        isNetwork && results.host && isLocalHost(results.host)
            ? LOCAL_HOST_NETWORK_NEXT_STEP
            : copy.nextStep;

    return (
        <Callout variant="danger" title={copy.headline(results.host)}>
            <Stack gap="sm">
                <Text size="sm">
                    {results.access
                        ? getAccessMessage(results.access)
                        : nextStep}
                </Text>
                {failure.cause === WarehouseConnectionFailureCause.TLS && (
                    <TlsChoice warehouseType={warehouseType} />
                )}
                {results.grantSuggestion && (
                    <GrantSuggestion suggestion={results.grantSuggestion} />
                )}
                <FoldedDetails details={failure.details} />
                <Group gap="md">
                    <Anchor
                        size="sm"
                        href={getWarehouseConnectionDocsUrl(
                            warehouseType,
                            failure.cause,
                        )}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Read the connection guide
                    </Anchor>
                    {sameCauseFailureCount >= INVITE_AFTER_SAME_FAILURES && (
                        <Button
                            size="xs"
                            variant="default"
                            component={Link}
                            to="/onboarding/invite-expert"
                            state={{ returnTo: pathname }}
                        >
                            Invite a teammate who has access
                        </Button>
                    )}
                </Group>
            </Stack>
        </Callout>
    );
};

type Props = {
    warehouseType: WarehouseTypes;
    isRunning: boolean;
    host: string | null;
    results: WarehouseConnectionStagedTestResults | null;
    sameCauseFailureCount: number;
};

export const StagedConnectionTestPanel: FC<Props> = ({
    warehouseType,
    isRunning,
    host,
    results,
    sameCauseFailureCount,
}) => {
    if (isRunning) return <RunningState host={host} />;
    if (!results) return null;
    return (
        <Stack gap="sm">
            <StageList results={results} />
            {results.failure && (
                <FailureCallout
                    warehouseType={warehouseType}
                    results={results}
                    failure={results.failure}
                    sameCauseFailureCount={sameCauseFailureCount}
                />
            )}
        </Stack>
    );
};
