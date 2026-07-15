import { type WarehouseTablesCatalog } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Progress,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconCheck } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { DocumentTitle } from '../components/common/DocumentTitle';
import MantineIcon from '../components/common/MantineIcon';
import { useTables } from '../features/sqlRunner/hooks/useTables';
import { useOnboardingPageGuard } from '../hooks/useOnboardingPageGuard';
import { useProject } from '../hooks/useProject';
import classes from './OnboardingProjectReady.module.css';

const TOTAL_STEPS = 4;
const STEP_CADENCE_MS = 600;

const OnboardingProjectReadyContent: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const navigate = useNavigate();
    const { data: project } = useProject(projectUuid);
    const {
        data: tables,
        isFetched: tablesFetched,
        isSuccess: tablesSuccess,
    } = useTables({ projectUuid });

    const [completedSteps, setCompletedSteps] = useState(0);

    const { schemaCount, tableCount } = useMemo(() => {
        const catalog = tables
            ? (tables as unknown as WarehouseTablesCatalog)
            : undefined;
        if (!catalog) {
            return { schemaCount: 0, tableCount: 0 };
        }
        let schemas = 0;
        let allTables = 0;
        Object.values(catalog).forEach((schemasByDatabase) => {
            Object.values(schemasByDatabase).forEach((tablesBySchema) => {
                schemas += 1;
                allTables += Object.keys(tablesBySchema).length;
            });
        });
        return { schemaCount: schemas, tableCount: allTables };
    }, [tables]);

    useEffect(() => {
        if (completedSteps >= TOTAL_STEPS) {
            return;
        }
        const stepBeingCompleted = completedSteps;
        const needsData = stepBeingCompleted === 1 || stepBeingCompleted === 2;
        if (needsData && !tablesFetched) {
            return;
        }
        const timer = setTimeout(() => {
            setCompletedSteps((current) => current + 1);
        }, STEP_CADENCE_MS);
        return () => clearTimeout(timer);
    }, [completedSteps, tablesFetched]);

    const warehouseType = project?.warehouseConnection?.type;

    const steps = [
        {
            label: 'Connecting to warehouse',
            annotation: warehouseType ? warehouseType.toLowerCase() : null,
        },
        {
            label: 'Reading schemas',
            annotation: tablesSuccess ? `${schemaCount} schemas` : null,
        },
        {
            label: 'Indexing tables & columns',
            annotation: tablesSuccess ? `${tableCount} tables` : null,
        },
        {
            label: 'Building semantic catalog',
            annotation: null,
        },
    ];

    const progress = (completedSteps / TOTAL_STEPS) * 100;
    const allDone = completedSteps >= TOTAL_STEPS;

    return (
        <Box className={classes.page}>
            <DocumentTitle title="Your project is ready" />

            <Box className={classes.column}>
                <Box className={classes.checkCircle}>
                    <MantineIcon
                        icon={IconCheck}
                        color="white"
                        size={36}
                        stroke={3}
                    />
                </Box>

                <Stack gap={6} className={classes.heading}>
                    <Title order={2} ta="center" fw={700}>
                        Your project is ready
                    </Title>
                    <Text c="dimmed" size="lg" ta="center">
                        Aurora now understands your data.
                    </Text>
                </Stack>

                <Box className={classes.progressSection}>
                    <Progress
                        value={progress}
                        color="blue"
                        size="md"
                        radius="xl"
                    />
                    <Text c="dimmed" className={classes.percentText}>
                        {Math.round(progress)}%
                    </Text>
                </Box>

                <Stack gap="md" className={classes.checklist}>
                    {steps.map((step, index) => {
                        const isDone = index < completedSteps;
                        return (
                            <Group
                                key={step.label}
                                justify="space-between"
                                wrap="nowrap"
                            >
                                <Group gap="sm" wrap="nowrap">
                                    {isDone ? (
                                        <MantineIcon
                                            icon={IconCheck}
                                            color="green"
                                            size={20}
                                        />
                                    ) : (
                                        <Box className={classes.pendingDot} />
                                    )}
                                    <Text fw={600} fz={16}>
                                        {step.label}
                                    </Text>
                                </Group>
                                {isDone && step.annotation && (
                                    <Text
                                        c="dimmed"
                                        className={classes.annotation}
                                    >
                                        {step.annotation}
                                    </Text>
                                )}
                            </Group>
                        );
                    })}
                </Stack>

                {allDone && (
                    <Button
                        color="dark"
                        size="lg"
                        radius="md"
                        className={classes.startButton}
                        onClick={() => void navigate('/onboarding/agent')}
                    >
                        Start chatting with Aurora
                    </Button>
                )}
            </Box>
        </Box>
    );
};

const OnboardingProjectReady: FC = () => {
    const { projectUuid } = useParams<{ projectUuid?: string }>();
    const guard = useOnboardingPageGuard();

    if (guard.status === 'blocked') {
        return guard.element;
    }

    if (!projectUuid) {
        return <Navigate to="/onboarding/agent" replace />;
    }

    return (
        <OnboardingProjectReadyContent
            key={projectUuid}
            projectUuid={projectUuid}
        />
    );
};

export default OnboardingProjectReady;
