import {
    ChartKind,
    type AiArtifact,
    type ToolRunSqlArgs,
    type VizTableConfig,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    HoverCard,
    Loader,
    Menu,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { Prism } from '@mantine/prism';
import {
    IconCircleCheck,
    IconCircleCheckFilled,
    IconDeviceFloppy,
    IconDots,
    IconExclamationCircle,
    IconEye,
    IconTableShortcut,
    IconTerminal2,
    IconX,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import TruncatedText from '../../../../../components/common/TruncatedText';
import { Table } from '../../../../../components/DataViz/visualizations/Table';
import { executeSqlQuery } from '../../../../../features/queryRunner/executeQuery';
import { DEFAULT_SQL_LIMIT } from '../../../../../features/sqlRunner/constants';
import { useCreateSqlChartMutation } from '../../../../../features/sqlRunner/hooks/useSavedSqlCharts';
import { SqlRunnerResultsRunnerFrontend } from '../../../../../features/sqlRunner/runners/SqlRunnerResultsRunnerFrontend';
import { useSpaceSummaries } from '../../../../../hooks/useSpaces';
import { useSetArtifactVersionVerified } from '../../hooks/useAiAgentArtifacts';
import { useAiAgentPermission } from '../../hooks/useAiAgentPermission';
import { clearArtifact } from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import styles from './AiArtifactPanel.module.css';
import { ChatElementsUtils } from './utils';

const getSqlTableChartConfig = (
    columns: { reference: string }[],
): VizTableConfig => ({
    type: ChartKind.TABLE,
    metadata: {
        version: 1,
    },
    columns: columns.reduce<VizTableConfig['columns']>((acc, column) => {
        acc[column.reference] = {
            reference: column.reference,
            label: column.reference,
            visible: true,
            frozen: false,
        };
        return acc;
    }, {}),
    display: {},
});

type SaveSqlArtifactModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    sqlChartConfig: ToolRunSqlArgs;
    tableConfig: VizTableConfig | undefined;
    defaultName: string;
    defaultDescription: string | null;
};

const SaveSqlArtifactModal: FC<SaveSqlArtifactModalProps> = ({
    opened,
    onClose,
    projectUuid,
    sqlChartConfig,
    tableConfig,
    defaultName,
    defaultDescription,
}) => {
    const [name, setName] = useState(defaultName);
    const [description, setDescription] = useState(defaultDescription ?? '');
    const [spaceUuid, setSpaceUuid] = useState<string | null>(null);

    const { data: spaces = [], isLoading: isLoadingSpaces } = useSpaceSummaries(
        projectUuid,
        true,
    );
    const { mutateAsync: createSqlChart, isLoading: isSaving } =
        useCreateSqlChartMutation(projectUuid);

    useEffect(() => {
        if (!spaceUuid && spaces[0]) {
            setSpaceUuid(spaces[0].uuid);
        }
    }, [spaceUuid, spaces]);

    const handleSave = async () => {
        if (!tableConfig || !spaceUuid || !name.trim()) return;

        await createSqlChart({
            name: name.trim(),
            description: description.trim() || null,
            sql: sqlChartConfig.sql,
            limit: sqlChartConfig.limit ?? DEFAULT_SQL_LIMIT,
            config: tableConfig,
            spaceUuid,
        });
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Save SQL chart"
            icon={IconTableShortcut}
            size="lg"
            onConfirm={handleSave}
            confirmLabel="Save"
            confirmLoading={isSaving}
            confirmDisabled={!tableConfig || !spaceUuid || !name.trim()}
            cancelDisabled={isSaving}
            modalRootProps={{ closeOnClickOutside: !isSaving }}
        >
            <Stack gap="sm">
                <TextInput
                    label="Chart name"
                    required
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                />
                <Textarea
                    label="Description"
                    value={description}
                    onChange={(event) =>
                        setDescription(event.currentTarget.value)
                    }
                />
                <Select
                    label="Space"
                    required
                    disabled={isLoadingSpaces || isSaving}
                    value={spaceUuid}
                    onChange={setSpaceUuid}
                    data={spaces.map((space) => ({
                        value: space.uuid,
                        label: space.name,
                    }))}
                />
            </Stack>
        </MantineModal>
    );
};

type SqlChartQuickOptionsProps = {
    projectUuid: string;
    agentUuid: string;
    artifactData: AiArtifact;
    sqlChartConfig: ToolRunSqlArgs;
    tableConfig: VizTableConfig | undefined;
    title: string;
    description: string | null;
};

const AiSqlChartQuickOptions: FC<SqlChartQuickOptionsProps> = ({
    projectUuid,
    agentUuid,
    artifactData,
    sqlChartConfig,
    tableConfig,
    title,
    description,
}) => {
    const [saveOpened, { open: openSave, close: closeSave }] =
        useDisclosure(false);
    const [
        verifyModalOpened,
        { open: openVerifyModal, close: closeVerifyModal },
    ] = useDisclosure(false);
    const { mutate: setVerified } = useSetArtifactVersionVerified(
        projectUuid,
        agentUuid,
    );
    const canManageAgent = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const isVerified = artifactData.verifiedByUserUuid !== null;
    const canVerify = canManageAgent;

    const handleVerifyToggle = () => {
        if (isVerified) {
            openVerifyModal();
            return;
        }

        setVerified({
            artifactUuid: artifactData.artifactUuid,
            versionUuid: artifactData.versionUuid,
            verified: true,
        });
    };

    const handleConfirmUnverify = () => {
        setVerified({
            artifactUuid: artifactData.artifactUuid,
            versionUuid: artifactData.versionUuid,
            verified: false,
        });
        closeVerifyModal();
    };

    return (
        <>
            {canVerify && (
                <Tooltip
                    label={
                        isVerified
                            ? 'Remove from verified answers'
                            : 'Add to verified answers'
                    }
                    position="bottom"
                >
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color={isVerified ? 'green' : 'ldGray.6'}
                        onClick={handleVerifyToggle}
                    >
                        <MantineIcon
                            icon={
                                isVerified
                                    ? IconCircleCheckFilled
                                    : IconCircleCheck
                            }
                            size="lg"
                        />
                    </ActionIcon>
                </Tooltip>
            )}
            <Menu withArrow position="bottom-end">
                <Menu.Target>
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="ldGray.9"
                        aria-label="SQL chart actions"
                    >
                        <MantineIcon icon={IconDots} size="lg" />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>Quick actions</Menu.Label>
                    <Menu.Item
                        onClick={openSave}
                        disabled={!tableConfig}
                        leftSection={<MantineIcon icon={IconDeviceFloppy} />}
                    >
                        Save
                    </Menu.Item>
                    <HoverSqlMenuItem sql={sqlChartConfig.sql} />
                    <Menu.Item
                        component={Link}
                        to={{ pathname: `/projects/${projectUuid}/sql-runner` }}
                        state={{ sql: sqlChartConfig.sql }}
                        leftSection={<MantineIcon icon={IconTerminal2} />}
                    >
                        Open in SQL Runner
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            <SaveSqlArtifactModal
                opened={saveOpened}
                onClose={closeSave}
                projectUuid={projectUuid}
                sqlChartConfig={sqlChartConfig}
                tableConfig={tableConfig}
                defaultName={title}
                defaultDescription={description}
            />
            <MantineModal
                opened={verifyModalOpened}
                onClose={closeVerifyModal}
                title="Remove from verified answers"
                icon={IconCircleCheck}
                size="sm"
                description="Are you sure you want to remove this answer from verified answers? It will no longer be used as an example in future Agent responses."
                onConfirm={handleConfirmUnverify}
                confirmLabel="Confirm"
            />
        </>
    );
};

const HoverSqlMenuItem: FC<{ sql: string }> = ({ sql }) => (
    <HoverCard
        shadow="subtle"
        radius="md"
        position="left-start"
        withinPortal
        openDelay={120}
    >
        <HoverCard.Target>
            <Menu.Item
                leftSection={<MantineIcon icon={IconEye} />}
                closeMenuOnClick={false}
            >
                View SQL
            </Menu.Item>
        </HoverCard.Target>
        <HoverCard.Dropdown p={0} maw={500}>
            <Prism
                language="sql"
                withLineNumbers
                noCopy
                styles={{
                    lineContent: {
                        fontSize: 10,
                    },
                }}
            >
                {sql}
            </Prism>
        </HoverCard.Dropdown>
    </HoverCard>
);

type AiSqlChartVisualizationProps = {
    artifactData: AiArtifact;
    projectUuid: string;
    agentUuid: string;
    sqlChartConfig: ToolRunSqlArgs;
    showCloseButton: boolean;
    variant?: 'floating' | 'inline';
};

export const AiSqlChartVisualization: FC<AiSqlChartVisualizationProps> = ({
    artifactData,
    projectUuid,
    agentUuid,
    sqlChartConfig,
    showCloseButton,
    variant = 'floating',
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const sqlLimit = sqlChartConfig.limit ?? DEFAULT_SQL_LIMIT;
    const sqlQuery = useQuery({
        queryKey: [
            'ai-agent-sql-chart-artifact',
            projectUuid,
            artifactData.artifactUuid,
            artifactData.versionUuid,
            sqlChartConfig.sql,
            sqlLimit,
        ],
        queryFn: () =>
            executeSqlQuery(projectUuid, sqlChartConfig.sql, sqlLimit),
        enabled: !!projectUuid && !!sqlChartConfig.sql,
    });

    const tableConfig = useMemo(
        () =>
            sqlQuery.data
                ? getSqlTableChartConfig(sqlQuery.data.columns)
                : undefined,
        [sqlQuery.data],
    );

    const resultsRunner = useMemo(() => {
        if (!sqlQuery.data) return null;

        return new SqlRunnerResultsRunnerFrontend({
            columns: sqlQuery.data.columns,
            rows: sqlQuery.data.results,
            projectUuid,
            limit: sqlLimit,
            sql: sqlChartConfig.sql,
            parameters: {},
        });
    }, [projectUuid, sqlLimit, sqlChartConfig.sql, sqlQuery.data]);

    const title =
        artifactData.title ?? sqlChartConfig.title ?? 'SQL query results';
    const description =
        artifactData.description ?? sqlChartConfig.description ?? null;

    if (sqlQuery.isLoading) {
        return (
            <Box {...ChatElementsUtils.centeredElementProps} p="md">
                <Center className={styles.loading}>
                    <Loader
                        type="dots"
                        color="gray"
                        delayedMessage="Loading SQL chart..."
                    />
                </Center>
            </Box>
        );
    }

    if (sqlQuery.error || !resultsRunner || !tableConfig) {
        return (
            <Box {...ChatElementsUtils.centeredElementProps} p="md">
                <Stack gap="xs" align="center" justify="center">
                    <MantineIcon icon={IconExclamationCircle} color="gray" />
                    <Text size="xs" c="dimmed" ta="center">
                        {sqlQuery.error instanceof Error
                            ? sqlQuery.error.message
                            : 'Failed to load SQL chart.'}
                    </Text>
                </Stack>
            </Box>
        );
    }

    const header = (
        <div className={styles.head}>
            <Stack gap={0} flex={1} miw={0}>
                <TruncatedText fz="sm" fw={600} maxWidth="100%">
                    {title}
                </TruncatedText>
                {description && (
                    <TruncatedText fz="xs" c="dimmed" maxWidth="100%">
                        {description}
                    </TruncatedText>
                )}
            </Stack>
            <Group gap={2} className={styles.headRight}>
                <AiSqlChartQuickOptions
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    artifactData={artifactData}
                    sqlChartConfig={sqlChartConfig}
                    tableConfig={tableConfig}
                    title={title}
                    description={description}
                />
                {showCloseButton && (
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="ldGray.6"
                        onClick={() => dispatch(clearArtifact())}
                        aria-label="Close"
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                )}
            </Group>
        </div>
    );

    const table = (
        <Table
            resultsRunner={resultsRunner}
            columnsConfig={tableConfig.columns}
            flexProps={{ mah: '100%' }}
        />
    );

    if (variant === 'inline') {
        return (
            <Box {...ChatElementsUtils.centeredElementProps} p="md">
                <Stack gap="md" h="100%">
                    {header}
                    {table}
                </Stack>
            </Box>
        );
    }

    return (
        <div className={styles.floatingPanel}>
            <div className={styles.floatingContent}>
                <Stack gap="md" h="100%">
                    {header}
                    <Box flex={1} style={{ overflow: 'auto' }}>
                        {table}
                    </Box>
                </Stack>
            </div>
        </div>
    );
};
