import {
    AI_AGENT_SKILL_FILE_NAME,
    buildAiAgentSkillMarkdown,
    isReservedAiAgentSkillName,
    isValidAiAgentSkillName,
    splitAiAgentSkillFrontmatter,
    type AiAgentSkillFiles,
    type AiAgentSkillIssue,
    type AiAgentSkillSummary,
} from '@lightdash/common';
import {
    Box,
    Code,
    Group,
    Input,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconBolt, IconMarkdown } from '@tabler/icons-react';
import { useState } from 'react';
import Callout from '../../../../components/common/Callout';
import EmptyStateLoader from '../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import {
    useAiAgentSkill,
    useCreateAiAgentSkill,
    useUpdateAiAgentSkill,
    useValidateAiAgentSkill,
} from '../hooks/useAiAgentSkills';
import styles from './AiAgentSkillModal.module.css';

const INSTRUCTIONS_PLACEHOLDER = `## When to use
Weekly performance review for a region.

## Steps
1. Pull revenue and orders for the last 7 days in $ARGUMENTS.
2. Compare with the previous week and flag moves over 10%.
3. Summarise the top three movers and one risk.`;

const nameError = (name: string): string | null => {
    if (name.length === 0) return 'A name is required';
    if (!isValidAiAgentSkillName(name)) {
        return 'Lowercase letters, digits and single hyphens only';
    }
    if (isReservedAiAgentSkillName(name, [])) {
        return 'Names starting with lightdash- are reserved';
    }
    return null;
};

const IssueList = ({
    issues,
    variant,
}: {
    issues: AiAgentSkillIssue[];
    variant: 'danger' | 'warning';
}) =>
    issues.length === 0 ? null : (
        <Callout
            variant={variant}
            title={
                variant === 'danger' ? 'Fix these before saving' : 'Warnings'
            }
        >
            <Stack gap={2}>
                {issues.map((issue) => (
                    <Text
                        key={`${issue.code}-${issue.path}-${issue.message}`}
                        size="xs"
                    >
                        {issue.message}
                    </Text>
                ))}
            </Stack>
        </Callout>
    );

type FormProps = {
    skill: AiAgentSkillSummary | null;
    existingFiles: AiAgentSkillFiles;
    bindToAgentUuid: string | null;
    onClose: () => void;
};

const SkillForm = ({
    skill,
    existingFiles,
    bindToAgentUuid,
    onClose,
}: FormProps) => {
    const isEditing = skill !== null;
    const createSkill = useCreateAiAgentSkill();
    const updateSkill = useUpdateAiAgentSkill();
    const validate = useValidateAiAgentSkill();

    // Other frontmatter keys (title, argument hint, ...) survive an edit untouched.
    const existing = splitAiAgentSkillFrontmatter(
        existingFiles[AI_AGENT_SKILL_FILE_NAME] ?? '',
    ) ?? { data: {}, body: '' };
    const form = useForm({
        initialValues: {
            name: skill?.name ?? '',
            description:
                typeof existing.data.description === 'string'
                    ? existing.data.description
                    : '',
            instructions: existing.body.trim(),
        },
        validate: {
            name: (value) => (isEditing ? null : nameError(value)),
            description: (value) =>
                value.trim().length === 0 ? 'A description is required' : null,
            instructions: (value) =>
                value.trim().length === 0 ? 'Instructions are required' : null,
        },
    });
    const [validatedFor, setValidatedFor] = useState<string | null>(null);

    const filesFor = (values: typeof form.values): AiAgentSkillFiles => ({
        ...existingFiles,
        [AI_AGENT_SKILL_FILE_NAME]: buildAiAgentSkillMarkdown(
            {
                ...existing.data,
                name: values.name,
                description: values.description,
            },
            values.instructions,
        ),
    });
    const currentFiles = filesFor(form.values);
    const currentKey = currentFiles[AI_AGENT_SKILL_FILE_NAME];

    const validation = validatedFor === currentKey ? validate.data : undefined;

    const handleSave = async () => {
        if (form.validate().hasErrors) return;
        const result = await validate.mutateAsync(currentFiles);
        setValidatedFor(currentKey);
        if (!result.valid) return;
        try {
            if (isEditing) {
                await updateSkill.mutateAsync({
                    skillUuid: skill.uuid,
                    files: currentFiles,
                });
            } else {
                await createSkill.mutateAsync({
                    files: currentFiles,
                    projectUuid: null,
                    agentUuids: bindToAgentUuid ? [bindToAgentUuid] : [],
                });
            }
        } catch {
            // The mutation hooks already show the error toast.
            return;
        }
        onClose();
    };

    return (
        <MantineModal
            opened
            onClose={onClose}
            size="lg"
            icon={IconBolt}
            title={isEditing ? `Edit /${skill.name}` : 'New skill'}
            onConfirm={() => void handleSave()}
            confirmLabel={isEditing ? 'Save new version' : 'Create skill'}
            confirmLoading={
                createSkill.isLoading ||
                updateSkill.isLoading ||
                validate.isLoading
            }
        >
            <Stack gap="lg">
                <TextInput
                    label="Name"
                    placeholder="weekly-review"
                    leftSection={
                        <Text size="sm" c="dimmed" ff="monospace">
                            /
                        </Text>
                    }
                    leftSectionWidth={24}
                    classNames={{ input: styles.nameInput }}
                    disabled={isEditing}
                    description={
                        isEditing
                            ? 'The name is the command and cannot change.'
                            : undefined
                    }
                    data-autofocus={!isEditing}
                    {...form.getInputProps('name')}
                />
                <TextInput
                    label="Description"
                    placeholder="Summarise the week for a region, with movers and risks"
                    {...form.getInputProps('description')}
                />
                <Input.Wrapper
                    label="Instructions"
                    error={form.errors.instructions}
                >
                    <Box className={styles.editor}>
                        <Textarea
                            variant="unstyled"
                            autosize
                            minRows={10}
                            maxRows={24}
                            placeholder={INSTRUCTIONS_PLACEHOLDER}
                            classNames={{ input: styles.editorInput }}
                            aria-label="Instructions"
                            {...form.getInputProps('instructions')}
                            error={undefined}
                        />
                        <Group
                            justify="space-between"
                            px="md"
                            py={6}
                            className={styles.editorFooter}
                        >
                            <Group gap={6}>
                                <MantineIcon
                                    icon={IconMarkdown}
                                    color="dimmed"
                                />
                                <Text size="xs" c="dimmed">
                                    Markdown
                                </Text>
                            </Group>
                            <Group gap={6}>
                                <Code fz="xs">$ARGUMENTS</Code>
                                <Text size="xs" c="dimmed">
                                    text typed after the command
                                </Text>
                            </Group>
                        </Group>
                    </Box>
                </Input.Wrapper>
                {validation ? (
                    <>
                        <IssueList
                            issues={validation.errors}
                            variant="danger"
                        />
                        <IssueList
                            issues={validation.warnings}
                            variant="warning"
                        />
                    </>
                ) : null}
            </Stack>
        </MantineModal>
    );
};

type Props = {
    /** Existing skill to edit; null creates a new one. */
    skill: AiAgentSkillSummary | null;
    /** Agent to bind a new skill to on creation. */
    bindToAgentUuid: string | null;
    onClose: () => void;
};

/** Loads the current files when editing, then mounts the form once per skill. */
export const AiAgentSkillModal = ({ skill, ...props }: Props) => {
    const detail = useAiAgentSkill(skill?.uuid ?? null);
    if (skill && !detail.data) {
        return (
            <MantineModal
                opened
                onClose={props.onClose}
                icon={IconBolt}
                title={`Edit /${skill.name}`}
            >
                {detail.isError ? (
                    <InlineErrorState
                        message={
                            detail.error.error.message ??
                            'Could not load this skill'
                        }
                    />
                ) : (
                    <EmptyStateLoader title="Loading skill" />
                )}
            </MantineModal>
        );
    }
    return (
        <SkillForm
            key={skill?.uuid ?? 'new'}
            skill={skill}
            existingFiles={detail.data?.content.files ?? {}}
            {...props}
        />
    );
};
