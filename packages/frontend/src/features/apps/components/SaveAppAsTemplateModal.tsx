import {
    DATA_APP_TEMPLATE_SLUG_PATTERN,
    generateSlug,
    type TemplateQuestion,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { IconPlus, IconTemplate, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useSaveAppAsTemplate } from '../hooks/useSaveAppAsTemplate';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    appUuid: string;
    appName: string;
    appDescription: string | null;
};

type QuestionDraft = {
    label: string;
    defaultValue: string;
    isList: boolean;
};

const toQuestions = (drafts: QuestionDraft[]): TemplateQuestion[] => {
    const seen = new Set<string>();
    return drafts
        .filter((draft) => draft.label.trim().length > 0)
        .map((draft) => {
            let key = generateSlug(draft.label).replace(/-/g, '_');
            let suffix = 2;
            while (seen.has(key)) {
                key = `${generateSlug(draft.label).replace(/-/g, '_')}_${suffix}`;
                suffix += 1;
            }
            seen.add(key);
            return {
                key,
                label: draft.label.trim(),
                ...(draft.defaultValue.trim()
                    ? { default: draft.defaultValue.trim() }
                    : {}),
                ...(draft.isList ? { kind: 'list' as const } : {}),
            };
        });
};

/**
 * Save a built app as an organization template. The app's current source
 * becomes the package; this form supplies the manifest's identity, the
 * questions the builder will be asked, and optional guidance for the agent.
 * An app built from a template keeps its bindings (the server merges).
 */
export const SaveAppAsTemplateModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    appUuid,
    appName,
    appDescription,
}) => {
    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [category, setCategory] = useState('General');
    const [description, setDescription] = useState('');
    const [guardrails, setGuardrails] = useState('');
    const [questions, setQuestions] = useState<QuestionDraft[]>([]);
    const { mutate, isLoading } = useSaveAppAsTemplate();

    useEffect(() => {
        if (!opened) return;
        setId(generateSlug(appName));
        setName(appName);
        setDescription(appDescription ?? '');
        setCategory('General');
        setGuardrails('');
        setQuestions([]);
    }, [opened, appName, appDescription]);

    const idError = useMemo(() => {
        if (id.length === 0) return 'Required';
        return DATA_APP_TEMPLATE_SLUG_PATTERN.test(id)
            ? null
            : 'Lowercase letters, numbers and dashes, 2 to 64 characters';
    }, [id]);
    const canSubmit =
        !idError &&
        name.trim().length > 0 &&
        description.trim().length > 0 &&
        category.trim().length > 0;

    const handleConfirm = () => {
        if (!canSubmit) return;
        mutate(
            {
                projectUuid,
                appUuid,
                template: {
                    id,
                    name: name.trim(),
                    description: description.trim(),
                    category: category.trim(),
                },
                questions: toQuestions(questions),
                ...(guardrails.trim() ? { guardrails: guardrails.trim() } : {}),
            },
            { onSuccess: onClose },
        );
    };

    const updateQuestion = (index: number, patch: Partial<QuestionDraft>) =>
        setQuestions((prev) =>
            prev.map((q, i) => (i === index ? { ...q, ...patch } : q)),
        );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Save as template"
            icon={IconTemplate}
            size="lg"
            confirmLabel="Publish template"
            confirmLoading={isLoading}
            confirmDisabled={!canSubmit}
            onConfirm={handleConfirm}
        >
            <Stack gap="sm">
                <Text size="sm" c="dimmed">
                    The app's current source becomes an organization template.
                    Anyone who can build from templates will see it in the From
                    Template gallery and be asked the questions below.
                </Text>
                <Group grow align="flex-start">
                    <TextInput
                        label="Name"
                        required
                        value={name}
                        onChange={(e) => setName(e.currentTarget.value)}
                        disabled={isLoading}
                    />
                    <TextInput
                        label="Template id"
                        description="Re-publishing with the same id replaces the template"
                        required
                        value={id}
                        error={idError ?? undefined}
                        onChange={(e) => setId(e.currentTarget.value)}
                        disabled={isLoading}
                    />
                </Group>
                <Group grow align="flex-start">
                    <TextInput
                        label="Category"
                        required
                        value={category}
                        onChange={(e) => setCategory(e.currentTarget.value)}
                        disabled={isLoading}
                    />
                </Group>
                <Textarea
                    label="Description"
                    required
                    autosize
                    minRows={2}
                    value={description}
                    onChange={(e) => setDescription(e.currentTarget.value)}
                    disabled={isLoading}
                />
                <Stack gap={6}>
                    <Group justify="space-between">
                        <div>
                            <Text size="sm" fw={500}>
                                Questions
                            </Text>
                            <Text size="xs" c="dimmed">
                                Asked instead of a blank prompt when someone
                                builds from this template.
                            </Text>
                        </div>
                        <Button
                            size="compact-xs"
                            variant="light"
                            leftSection={
                                <MantineIcon icon={IconPlus} size={12} />
                            }
                            onClick={() =>
                                setQuestions((prev) => [
                                    ...prev,
                                    {
                                        label: '',
                                        defaultValue: '',
                                        isList: false,
                                    },
                                ])
                            }
                            disabled={isLoading}
                        >
                            Add question
                        </Button>
                    </Group>
                    {questions.map((question, index) => (
                        <Group
                            // eslint-disable-next-line react/no-array-index-key
                            key={index}
                            gap="xs"
                            align="flex-end"
                            wrap="nowrap"
                        >
                            <TextInput
                                label="Question"
                                placeholder="What should we forecast?"
                                value={question.label}
                                onChange={(e) =>
                                    updateQuestion(index, {
                                        label: e.currentTarget.value,
                                    })
                                }
                                style={{ flex: 2 }}
                                disabled={isLoading}
                            />
                            <TextInput
                                label="Default answer"
                                value={question.defaultValue}
                                onChange={(e) =>
                                    updateQuestion(index, {
                                        defaultValue: e.currentTarget.value,
                                    })
                                }
                                style={{ flex: 1 }}
                                disabled={isLoading}
                            />
                            <Checkbox
                                label="List"
                                checked={question.isList}
                                onChange={(e) =>
                                    updateQuestion(index, {
                                        isList: e.currentTarget.checked,
                                    })
                                }
                                pb={8}
                                disabled={isLoading}
                            />
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label="Remove question"
                                mb={4}
                                onClick={() =>
                                    setQuestions((prev) =>
                                        prev.filter((_, i) => i !== index),
                                    )
                                }
                                disabled={isLoading}
                            >
                                <MantineIcon icon={IconTrash} size={14} />
                            </ActionIcon>
                        </Group>
                    ))}
                </Stack>
                <Textarea
                    label="Guidance for the agent"
                    description="Optional. Saved as the template's AGENTS.md and shown to the agent on every build; builders can still override it."
                    placeholder="Keep the monthly methodology; change bindings and labels in src/template.json rather than rewriting components."
                    autosize
                    minRows={2}
                    maxRows={6}
                    value={guardrails}
                    onChange={(e) => setGuardrails(e.currentTarget.value)}
                    disabled={isLoading}
                />
            </Stack>
        </MantineModal>
    );
};
