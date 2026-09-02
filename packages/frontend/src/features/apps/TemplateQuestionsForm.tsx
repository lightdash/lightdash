import {
    type AppClarification,
    type TemplateQuestion,
} from '@lightdash/common';
import {
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Textarea,
    TextInput,
    ThemeIcon,
} from '@mantine/core';
import { IconTemplate } from '@tabler/icons-react';
import { useState, type FC } from 'react';

export type QuestionsTemplate = {
    slug: string;
    name: string;
    questions: TemplateQuestion[];
};

type Props = {
    template: QuestionsTemplate;
    disabled?: boolean;
    onBuild: (payload: {
        clarifications: AppClarification[];
        prompt: string;
    }) => void;
    onChangeTemplate: () => void;
};

/**
 * The create-from-template step: the template's declared questions in place
 * of the freeform composer, pre-filled from the registry defaults so a user
 * can build without typing. Answers travel as clarifications — the form is
 * the clarification round — and the only freeform slot is the closing
 * "anything else?", which becomes the build prompt.
 */
const TemplateQuestionsForm: FC<Props> = ({
    template,
    disabled = false,
    onBuild,
    onChangeTemplate,
}) => {
    const { questions } = template;
    const [answers, setAnswers] = useState<Record<string, string>>(() =>
        Object.fromEntries(questions.map((q) => [q.key, q.default ?? ''])),
    );
    const [extra, setExtra] = useState('');
    const missing = questions.filter(
        (q) => q.required && !(answers[q.key] ?? '').trim(),
    );

    const handleBuild = () => {
        if (missing.length > 0) return;
        const clarifications: AppClarification[] = questions
            .map((q) => ({
                question: q.label,
                answer: (answers[q.key] ?? '').trim(),
            }))
            .filter((c) => c.answer.length > 0);
        onBuild({
            clarifications,
            prompt: extra.trim() || `Build the ${template.name} as configured.`,
        });
    };

    return (
        <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
                <Group gap="sm" wrap="nowrap" align="flex-start">
                    <ThemeIcon
                        size="lg"
                        radius="md"
                        variant="light"
                        color="gray"
                    >
                        <IconTemplate size={20} />
                    </ThemeIcon>
                    <div>
                        <Text fw={600} size="sm">
                            {template.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                            Answer a few questions and the template is bound to
                            your data. Refine anything else in chat after the
                            first build.
                        </Text>
                    </div>
                </Group>

                {questions.map((q) =>
                    q.kind === 'list' ? (
                        <Textarea
                            size="sm"
                            key={q.key}
                            label={q.label}
                            description="One per line"
                            placeholder={q.placeholder}
                            withAsterisk={q.required}
                            autosize
                            minRows={2}
                            value={answers[q.key] ?? ''}
                            onChange={(e) => {
                                const { value } = e.currentTarget;
                                setAnswers((prev) => ({
                                    ...prev,
                                    [q.key]: value,
                                }));
                            }}
                            disabled={disabled}
                        />
                    ) : (
                        <TextInput
                            size="sm"
                            key={q.key}
                            label={q.label}
                            placeholder={q.placeholder}
                            withAsterisk={q.required}
                            value={answers[q.key] ?? ''}
                            onChange={(e) => {
                                const { value } = e.currentTarget;
                                setAnswers((prev) => ({
                                    ...prev,
                                    [q.key]: value,
                                }));
                            }}
                            disabled={disabled}
                        />
                    ),
                )}

                <Textarea
                    label="Anything else you'd like this app to do?"
                    placeholder="Optional"
                    autosize
                    minRows={1}
                    value={extra}
                    onChange={(e) => setExtra(e.currentTarget.value)}
                    disabled={disabled}
                />

                <Group justify="space-between">
                    <Button
                        variant="subtle"
                        color="gray"
                        size="xs"
                        onClick={onChangeTemplate}
                        disabled={disabled}
                    >
                        Change template
                    </Button>
                    <Button
                        onClick={handleBuild}
                        disabled={disabled || missing.length > 0}
                    >
                        Build
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
};

export default TemplateQuestionsForm;
