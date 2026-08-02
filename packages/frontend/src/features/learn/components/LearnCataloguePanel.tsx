import {
    Anchor,
    Badge,
    Button,
    Group,
    Paper,
    Progress,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconExternalLink, IconSchool, IconSearch } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { getLastCourseId, useLearnCatalogue, useLearnRollups } from '../hooks';
import {
    askMatch,
    badgeStates,
    pathProgress,
    pathsFromCatalogue,
    resumeTarget,
    type PathName,
} from '../model';

const PATH_KEY = 'lightdash.learn.path.v1';

const ASK_SUGGESTIONS = [
    'I need to build a dashboard for my team',
    'How do I write metrics in dbt?',
    'Make the AI analyst give better answers',
];

const PATH_META: Record<
    PathName,
    { title: string; color: string; blurb: string }
> = {
    analyst: {
        title: 'Analyst',
        color: 'violet.6',
        blurb: 'Explores, charts, dashboards and the AI analyst.',
    },
    builder: {
        title: 'Builder',
        color: 'teal.6',
        blurb: 'Metrics as code, modelling and governance.',
    },
};

export const LearnCataloguePanel: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const navigate = useNavigate();
    const catalogue = useLearnCatalogue();
    const { rollups, serverSynced } = useLearnRollups();
    const [selectedPath, setSelectedPath] = useState<PathName>(() =>
        localStorage.getItem(PATH_KEY) === 'builder' ? 'builder' : 'analyst',
    );
    const [askQuery, setAskQuery] = useState('');
    const [askSubmitted, setAskSubmitted] = useState<string | null>(null);

    const paths = useMemo(
        () =>
            catalogue.data ? pathsFromCatalogue(catalogue.data.courses) : null,
        [catalogue.data],
    );

    const openCourse = (courseId: string) =>
        navigate(
            `/projects/${projectUuid}/learn/courses/${encodeURIComponent(
                courseId,
            )}`,
        );

    const catalogueData = catalogue.data;

    if (catalogue.isInitialLoading) {
        return (
            <SuboptimalState title="Loading Lightdash University…" loading />
        );
    }
    if (catalogue.isError || !paths || !catalogueData) {
        return (
            <SuboptimalState
                title="Couldn't load the course catalogue"
                description="Learn content is fetched from Lightdash University — check the instance can reach it, then retry."
            />
        );
    }

    const path = paths[selectedPath];
    const meta = PATH_META[selectedPath];
    const progress = pathProgress(path, rollups);
    const badges = badgeStates(path, rollups);
    const allCourses = [...path.foundations, ...path.courses];
    const resume = resumeTarget(allCourses, rollups, getLastCourseId());
    const askResult = askSubmitted
        ? askMatch(askSubmitted, catalogueData.courses)
        : null;

    return (
        <Stack gap="lg" py="lg">
            <Group justify="space-between" align="flex-end">
                <Stack gap={4}>
                    <Title order={2}>Lightdash University</Title>
                    <Text c="dimmed" maw={560}>
                        Learn Lightdash inside Lightdash. Every module ends in
                        your own workspace — with your data, your dashboards,
                        your models.
                    </Text>
                </Stack>
                <Group gap="xs">
                    <Button
                        variant="default"
                        component="a"
                        href="https://docs.lightdash.com"
                        target="_blank"
                        rel="noreferrer"
                        rightSection={<MantineIcon icon={IconExternalLink} />}
                    >
                        Docs site
                    </Button>
                    {resume && (
                        <Button onClick={() => openCourse(resume.id)}>
                            Resume module
                        </Button>
                    )}
                </Group>
            </Group>

            <Group justify="space-between">
                <SegmentedControl
                    value={selectedPath}
                    onChange={(value) => {
                        localStorage.setItem(PATH_KEY, value);
                        setSelectedPath(value as PathName);
                    }}
                    data={(['analyst', 'builder'] as const).map((name) => {
                        const p = pathProgress(paths[name], rollups);
                        return {
                            value: name,
                            label: `${PATH_META[name].title} path ${p.completed}/${p.total}`,
                        };
                    })}
                />
                {!serverSynced && (
                    <Tooltip label="Progress is saved in this browser only — this instance isn't connected to the Lightdash University progress service.">
                        <Badge variant="light" color="gray">
                            Local progress
                        </Badge>
                    </Tooltip>
                )}
            </Group>

            <Group align="stretch" grow>
                <Paper withBorder radius="md" p="md">
                    <Text size="xs" fw={600} tt="uppercase" c={meta.color}>
                        {meta.title} path
                    </Text>
                    <Group gap={6} align="baseline" mt={4}>
                        <Title order={1}>{progress.completed}</Title>
                        <Text c="dimmed">
                            of {progress.total} modules complete
                        </Text>
                    </Group>
                    <Progress
                        value={progress.pct}
                        size="sm"
                        mt="sm"
                        color={meta.color}
                    />
                </Paper>
                <Paper withBorder radius="md" p="md">
                    <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                        {meta.title} badges
                    </Text>
                    <Group gap="xs" mt="sm">
                        {badges.map((b) => (
                            <Tooltip
                                key={b.id}
                                label={
                                    b.earned
                                        ? 'Earned'
                                        : `${b.remaining} more to unlock`
                                }
                            >
                                <Badge
                                    size="lg"
                                    variant={b.earned ? 'filled' : 'outline'}
                                    color={b.earned ? meta.color : 'gray'}
                                    leftSection={
                                        <MantineIcon icon={IconSchool} />
                                    }
                                >
                                    {b.name} · {b.threshold}
                                </Badge>
                            </Tooltip>
                        ))}
                    </Group>
                </Paper>
            </Group>

            <Paper withBorder radius="md" p="md">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        setAskSubmitted(askQuery);
                    }}
                >
                    <Group>
                        <TextInput
                            style={{ flex: 1 }}
                            leftSection={<MantineIcon icon={IconSearch} />}
                            placeholder='What do you want to learn? e.g. "I need to build a dashboard for my team"'
                            value={askQuery}
                            onChange={(e) => setAskQuery(e.currentTarget.value)}
                        />
                        <Button type="submit">Ask</Button>
                    </Group>
                </form>
                <Group gap="xs" mt="sm">
                    {ASK_SUGGESTIONS.map((s) => (
                        <Badge
                            key={s}
                            variant="outline"
                            color="gray"
                            style={{ cursor: 'pointer', textTransform: 'none' }}
                            onClick={() => {
                                setAskQuery(s);
                                setAskSubmitted(s);
                            }}
                        >
                            {s}
                        </Badge>
                    ))}
                </Group>
                {askSubmitted && (
                    <Text size="sm" mt="sm">
                        {askResult ? (
                            <>
                                Best match:{' '}
                                <Anchor
                                    onClick={() => openCourse(askResult.id)}
                                >
                                    {askResult.title} →
                                </Anchor>
                            </>
                        ) : (
                            'No matching course — try different words.'
                        )}
                    </Text>
                )}
            </Paper>
        </Stack>
    );
};
