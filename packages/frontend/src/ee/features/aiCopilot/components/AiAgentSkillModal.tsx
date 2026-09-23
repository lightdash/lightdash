import {
    AI_AGENT_SKILL_FILE_NAME,
    isReservedAiAgentSkillName,
    isValidAiAgentSkillName,
    suggestAiAgentSkillName,
    type AiAgentSkillFiles,
    type AiAgentSkillIssue,
    type AiAgentSkillSummary,
} from '@lightdash/common';
import { Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconBolt } from '@tabler/icons-react';
import { useState } from 'react';
import Callout from '../../../../components/common/Callout';
import EmptyStateLoader from '../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../components/common/InlineErrorState';
import MantineModal from '../../../../components/common/MantineModal';
import {
    useAiAgentSkill,
    useCreateAiAgentSkill,
    useUpdateAiAgentSkill,
    useValidateAiAgentSkill,
} from '../hooks/useAiAgentSkills';

const templateFor = (name: string, title: string) => `---
name: ${name}
title: ${title}
description: Describe when the agent should use this skill and what it does.
argument-hint: "[what to pass after /${name}]"
---

Write the instructions the agent should follow here. Use $ARGUMENTS where the
text typed after /${name} should go.
`;

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
                        <Text span ff="monospace">
                            {issue.path}
                        </Text>
                        : {issue.message}
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

    const form = useForm({
        initialValues: {
            title: skill?.title ?? '',
            name: skill?.name ?? '',
            markdown: existingFiles[AI_AGENT_SKILL_FILE_NAME] ?? '',
        },
        validate: {
            name: (value) => (isEditing ? null : nameError(value)),
        },
        validateInputOnChange: ['name'],
    });
    // The name follows the title until typed by hand; once saved it is the
    // slug, the folder and the /command, so it cannot change afterwards.
    const [nameTouched, setNameTouched] = useState(isEditing);
    const [markdownTouched, setMarkdownTouched] = useState(isEditing);
    const [validatedMarkdown, setValidatedMarkdown] = useState<string | null>(
        null,
    );

    // Resources beyond SKILL.md stay as they are; this editor only touches the
    // main file in the first cut.
    const filesFor = (markdown: string): AiAgentSkillFiles => ({
        ...existingFiles,
        [AI_AGENT_SKILL_FILE_NAME]: markdown,
    });

    const applyTemplate = () => {
        if (markdownTouched) return;
        form.setFieldValue(
            'markdown',
            templateFor(
                form.values.name || 'my-skill',
                form.values.title || 'My skill',
            ),
        );
    };

    const runValidation = (markdown: string) => {
        setValidatedMarkdown(markdown);
        validate.mutate(filesFor(markdown));
    };

    const validation =
        validatedMarkdown === form.values.markdown ? validate.data : undefined;
    const hasBlockingErrors = validation !== undefined && !validation.valid;

    const handleSave = async () => {
        const { markdown } = form.values;
        const result = await validate.mutateAsync(filesFor(markdown));
        setValidatedMarkdown(markdown);
        if (!result.valid) return;
        try {
            if (isEditing) {
                await updateSkill.mutateAsync({
                    skillUuid: skill.uuid,
                    files: filesFor(markdown),
                });
            } else {
                await createSkill.mutateAsync({
                    files: filesFor(markdown),
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

    const saving = createSkill.isLoading || updateSkill.isLoading;
    const saveLabel = (() => {
        if (isEditing) return 'Save new version';
        return bindToAgentUuid ? 'Create and bind' : 'Create skill';
    })();

    return (
        <MantineModal
            opened
            onClose={onClose}
            size="xl"
            icon={IconBolt}
            title={isEditing ? `Edit /${skill.name}` : 'New skill'}
            actions={
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void handleSave()}
                        loading={saving || validate.isLoading}
                        disabled={
                            form.values.markdown.trim().length === 0 ||
                            hasBlockingErrors ||
                            (!isEditing && nameError(form.values.name) !== null)
                        }
                    >
                        {saveLabel}
                    </Button>
                </Group>
            }
        >
            <Stack gap="md">
                {!isEditing && bindToAgentUuid ? (
                    <Callout variant="info">
                        Saving publishes version 1 and binds the skill to this
                        agent. It also joins the organization library, where any
                        agent can use it.
                    </Callout>
                ) : null}
                {!isEditing ? (
                    <Group grow align="flex-start">
                        <TextInput
                            label="Title"
                            placeholder="Weekly review"
                            value={form.values.title}
                            onChange={(event) => {
                                const title = event.currentTarget.value;
                                form.setFieldValue('title', title);
                                if (!nameTouched) {
                                    form.setFieldValue(
                                        'name',
                                        suggestAiAgentSkillName(title),
                                    );
                                }
                            }}
                            onBlur={applyTemplate}
                        />
                        <TextInput
                            label="Name"
                            description="The /command and the folder name. Cannot change later."
                            placeholder="weekly-review"
                            {...form.getInputProps('name')}
                            onChange={(event) => {
                                setNameTouched(true);
                                form.setFieldValue(
                                    'name',
                                    event.currentTarget.value,
                                );
                            }}
                            onBlur={applyTemplate}
                        />
                    </Group>
                ) : null}
                <Textarea
                    label={AI_AGENT_SKILL_FILE_NAME}
                    description="Frontmatter needs name and description. The body is what the agent reads; $ARGUMENTS receives the text typed after the command."
                    autosize
                    minRows={14}
                    maxRows={30}
                    value={form.values.markdown}
                    onChange={(event) => {
                        setMarkdownTouched(true);
                        form.setFieldValue(
                            'markdown',
                            event.currentTarget.value,
                        );
                    }}
                    onBlur={() => runValidation(form.values.markdown)}
                />
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
