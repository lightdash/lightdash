import { Button, Stack, Text, TextInput, ThemeIcon } from '@mantine-8/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import classes from './AppTemplateQuestions.module.css';
import { type TemplateDefinition } from './templates';

type Props = {
    template: TemplateDefinition;
    answers: Record<string, string>;
    onAnswersChange: (answers: Record<string, string>) => void;
    onBack: () => void;
    onContinue: () => void;
};

const AppTemplateQuestions: FC<Props> = ({
    template,
    answers,
    onAnswersChange,
    onBack,
    onContinue,
}) => {
    const Icon = template.icon;
    const allRequiredAnswered = template.questions.every(
        (q) => !q.required || (answers[q.id] ?? '').trim().length > 0,
    );

    const setAnswer = (id: string, value: string) => {
        onAnswersChange({ ...answers, [id]: value });
    };

    return (
        <div className={classes.wrapper}>
            <div className={classes.header}>
                <ThemeIcon size="lg" radius="md" variant="light" color="gray">
                    <Icon size={20} />
                </ThemeIcon>
                <Stack gap={2} className={classes.headerTitle}>
                    <Text fw={600} size="md">
                        {template.title}
                    </Text>
                    <Text size="xs" c="dimmed">
                        Answer a few questions and we'll draft your prompt.
                    </Text>
                </Stack>
            </div>
            <Stack gap="sm">
                {template.questions.map((question) => (
                    <TextInput
                        key={question.id}
                        label={question.label}
                        placeholder={question.placeholder}
                        value={answers[question.id] ?? ''}
                        onChange={(e) =>
                            setAnswer(question.id, e.currentTarget.value)
                        }
                        withAsterisk={question.required}
                        autoFocus={question === template.questions[0]}
                    />
                ))}
            </Stack>
            <div className={classes.footer}>
                <Button
                    variant="subtle"
                    color="gray"
                    leftSection={<IconArrowLeft size={14} />}
                    onClick={onBack}
                >
                    Back
                </Button>
                <Button onClick={onContinue} disabled={!allRequiredAnswered}>
                    Continue
                </Button>
            </div>
        </div>
    );
};

export default AppTemplateQuestions;
