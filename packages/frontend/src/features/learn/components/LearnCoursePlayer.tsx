import {
    HTML_SANITIZE_MARKDOWN_TILE_RULES,
    sanitizeHtml,
    type LearnCourse,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Group,
    Paper,
    Progress,
    Radio,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import {
    getLessonBookmark,
    setLastCourseId,
    setLessonBookmark,
    useLearnCourse,
    useLearnRollups,
    useRecordLearnEvent,
} from '../hooks';
import { cardState, emptyRollup } from '../model';

function scoreQuiz(
    questions: LearnCourse['quiz']['questions'],
    answers: ReadonlyArray<number | null>,
): number {
    const correct = questions.filter((q, i) => answers[i] === q.answer).length;
    return Math.round((correct / questions.length) * 100);
}

function lessonHtml(course: LearnCourse, index: number): string {
    const raw = course.lessons[index].html.replace(
        /src="assets\//g,
        `src="${course.assetBaseUrl}/assets/`,
    );
    return sanitizeHtml(raw, HTML_SANITIZE_MARKDOWN_TILE_RULES);
}

export const LearnCoursePlayer: FC = () => {
    const { projectUuid, courseId } = useParams<{
        projectUuid: string;
        courseId: string;
    }>();
    const navigate = useNavigate();
    const course = useLearnCourse(courseId);
    const { rollups } = useLearnRollups();
    const { record } = useRecordLearnEvent();

    const rollup = (courseId && rollups.get(courseId)) || emptyRollup();
    const state = cardState(courseId ? rollups.get(courseId) : undefined);

    // page ∈ [0, lessonCount-1] = lessons; page === lessonCount = quiz.
    const [page, setPage] = useState<number | null>(null);
    const [answers, setAnswers] = useState<(number | null)[]>([]);
    const [quizResult, setQuizResult] = useState<number | null>(null);
    const [started, setStarted] = useState(false);

    useEffect(() => {
        if (courseId) setLastCourseId(courseId);
    }, [courseId]);

    const data = course.data;

    const eventObject = useMemo(
        () =>
            data && courseId
                ? {
                      course: courseId,
                      contentHash: data.contentHash,
                      version: data.version,
                  }
                : null,
        [data, courseId],
    );

    useEffect(() => {
        if (!data || page !== null || !courseId) return;
        const bookmark = getLessonBookmark(courseId);
        const bookmarkIndex = data.lessons.findIndex((l) => l.id === bookmark);
        setPage(bookmarkIndex >= 0 ? bookmarkIndex : 0);
        setAnswers(data.quiz.questions.map(() => null));
    }, [data, page, courseId]);

    useEffect(() => {
        if (!data || started || state !== 'open' || !eventObject) return;
        setStarted(true);
        record({
            verb: 'started',
            object: { type: 'course', ...eventObject },
        });
    }, [data, started, state, eventObject, record]);

    if (course.isInitialLoading || (data && page === null)) {
        return <SuboptimalState title="Loading course…" loading />;
    }
    if (course.isError || !data || page === null || !eventObject) {
        return (
            <SuboptimalState
                title="Couldn't load this course"
                description="It may have been unpublished, or the content service is unreachable."
            />
        );
    }

    const lessonCount = data.lessons.length;
    const onQuiz = page >= lessonCount;
    const progressPct = Math.round(((page + 1) / (lessonCount + 1)) * 100);

    const go = (next: number) => {
        if (next > page && page < lessonCount) {
            const lesson = data.lessons[page];
            if (!rollup.lessonsCompleted.has(lesson.id)) {
                record({
                    verb: 'completed',
                    object: {
                        type: 'lesson',
                        lesson: lesson.id,
                        ...eventObject,
                    },
                });
            }
        }
        const clamped = Math.max(0, Math.min(lessonCount, next));
        if (clamped < lessonCount && courseId) {
            setLessonBookmark(courseId, data.lessons[clamped].id);
        }
        setQuizResult(null);
        setPage(clamped);
    };

    const submitQuiz = () => {
        const score = scoreQuiz(data.quiz.questions, answers);
        const passed = score >= data.passingScore;
        record({
            verb: passed ? 'passed' : 'failed',
            object: { type: 'quiz', ...eventObject },
            result: { score, passed },
        });
        if (passed && !rollup.completed) {
            record({
                verb: 'completed',
                object: { type: 'course', ...eventObject },
                result: { completion: true },
            });
        }
        setQuizResult(score);
    };

    return (
        <Stack gap="md" py="lg" maw={760} mx="auto">
            <Anchor
                size="sm"
                onClick={() => navigate(`/projects/${projectUuid}/learn`)}
            >
                <Group gap={4}>
                    <MantineIcon icon={IconArrowLeft} />
                    All courses
                </Group>
            </Anchor>

            <Paper withBorder radius="md" p="lg">
                <Stack gap={4}>
                    <Title order={2}>{data.title}</Title>
                    <Text size="sm" c="dimmed">
                        {lessonCount} lessons · {rollup.lessonsCompleted.size}{' '}
                        of {lessonCount} done
                        {rollup.passed ? ' · Passed' : ''}
                    </Text>
                </Stack>
            </Paper>

            <Paper withBorder radius="md">
                <Group justify="space-between" p="md" pb="xs">
                    <Text fw={600}>{data.title}</Text>
                    <Text size="sm" c="dimmed">
                        {onQuiz
                            ? 'Quiz'
                            : `Lesson ${page + 1} of ${lessonCount}`}
                    </Text>
                </Group>
                <Progress value={progressPct} size="xs" radius={0} />
                <Stack p="lg" gap="md">
                    {!onQuiz && (
                        <div
                            // eslint-disable-next-line react/no-danger
                            dangerouslySetInnerHTML={{
                                __html: lessonHtml(data, page),
                            }}
                            style={{ lineHeight: 1.6 }}
                        />
                    )}
                    {onQuiz && quizResult === null && (
                        <Stack gap="md">
                            <Title order={3}>Quiz</Title>
                            <Text size="sm" c="dimmed">
                                Answer all questions. Passing score:{' '}
                                {data.passingScore}%.
                            </Text>
                            {data.quiz.questions.map((q, qi) => (
                                <Radio.Group
                                    key={q.id}
                                    label={`${qi + 1}. ${q.prompt}`}
                                    value={
                                        answers[qi] === null
                                            ? null
                                            : String(answers[qi])
                                    }
                                    onChange={(value) =>
                                        setAnswers((prev) => {
                                            const next = [...prev];
                                            next[qi] = Number(value);
                                            return next;
                                        })
                                    }
                                >
                                    <Stack gap={6} mt="xs">
                                        {q.choices.map((choice, ci) => (
                                            <Radio
                                                key={choice}
                                                value={String(ci)}
                                                label={choice}
                                            />
                                        ))}
                                    </Stack>
                                </Radio.Group>
                            ))}
                            <Button onClick={submitQuiz}>Submit answers</Button>
                        </Stack>
                    )}
                    {onQuiz && quizResult !== null && (
                        <Stack gap="md">
                            <Title order={3}>Your result: {quizResult}%</Title>
                            <Text
                                c={
                                    quizResult >= data.passingScore
                                        ? 'green'
                                        : 'red'
                                }
                            >
                                {quizResult >= data.passingScore
                                    ? 'You passed — nice work!'
                                    : `You need ${data.passingScore}% to pass.`}
                            </Text>
                            {data.quiz.questions.map((q, qi) => {
                                const given = answers[qi];
                                const correct = given === q.answer;
                                return (
                                    <Paper
                                        key={q.id}
                                        withBorder
                                        radius="md"
                                        p="sm"
                                        style={{
                                            borderColor: correct
                                                ? 'var(--mantine-color-green-4)'
                                                : 'var(--mantine-color-red-4)',
                                        }}
                                    >
                                        <Text size="sm" fw={600}>
                                            {qi + 1}. {q.prompt}
                                        </Text>
                                        <Text size="sm">
                                            Your answer:{' '}
                                            <strong>
                                                {given === null
                                                    ? '—'
                                                    : q.choices[given]}
                                            </strong>
                                        </Text>
                                        {!correct && (
                                            <Text size="sm">
                                                Correct answer:{' '}
                                                <strong>
                                                    {q.choices[q.answer]}
                                                </strong>
                                            </Text>
                                        )}
                                    </Paper>
                                );
                            })}
                            {quizResult < data.passingScore && (
                                <Button
                                    variant="default"
                                    onClick={() => {
                                        setAnswers(
                                            data.quiz.questions.map(() => null),
                                        );
                                        setQuizResult(null);
                                    }}
                                >
                                    Try again
                                </Button>
                            )}
                        </Stack>
                    )}
                </Stack>
                {!onQuiz && (
                    <Group justify="space-between" p="md" pt={0}>
                        {page > 0 ? (
                            <Button
                                variant="default"
                                onClick={() => go(page - 1)}
                            >
                                Back
                            </Button>
                        ) : (
                            <span />
                        )}
                        <Button onClick={() => go(page + 1)}>
                            {page === lessonCount - 1 ? 'Start quiz' : 'Next'}
                        </Button>
                    </Group>
                )}
            </Paper>
        </Stack>
    );
};
