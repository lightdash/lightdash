import {
    AI_AGENT_SKILL_FILE_NAME,
    suggestAiAgentSkillName,
    type AiAgentSkillFiles,
    type AiAgentSkillIssue,
    type AiAgentSkillSummary,
} from '@lightdash/common';
import {
    Button,
    Group,
    Loader,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { IconBolt } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import Callout from '../../../../components/common/Callout';
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
    onSaved?: (skillUuid: string) => void;
};

const SkillForm = ({
    skill,
    existingFiles,
    bindToAgentUuid,
    onClose,
    onSaved,
}: FormProps) => {
    const isEditing = skill !== null;
    const createSkill = useCreateAiAgentSkill();
    const updateSkill = useUpdateAiAgentSkill();
    const validate = useValidateAiAgentSkill();

    const [title, setTitle] = useState(skill?.title ?? '');
    const [typedName, setTypedName] = useState<string | null>(
        skill?.name ?? null,
    );
    // The name follows the title until typed by hand; once saved it is the
    // slug, the folder and the /command, so it cannot change afterwards.
    const name = typedName ?? suggestAiAgentSkillName(title);
    const [markdown, setMarkdown] = useState(
        existingFiles[AI_AGENT_SKILL_FILE_NAME] ??
            templateFor(name || 'my-skill', title || 'My skill'),
    );
    const [templateApplied, setTemplateApplied] = useState(isEditing);

    // Resources beyond SKILL.md stay as they are; this editor only touches the
    // main file in the first cut.
    const filesToSave = useMemo(
        () => ({ ...existingFiles, [AI_AGENT_SKILL_FILE_NAME]: markdown }),
        [existingFiles, markdown],
    );

    const applyTemplate = () => {
        if (!templateApplied) {
            setMarkdown(templateFor(name || 'my-skill', title || 'My skill'));
        }
    };

    const handleSave = async () => {
        const result = await validate.mutateAsync(filesToSave);
        if (!result.valid) return;
        if (isEditing && skill) {
            const saved = await updateSkill.mutateAsync({
                skillUuid: skill.uuid,
                files: filesToSave,
            });
            onSaved?.(saved.uuid);
        } else {
            const created = await createSkill.mutateAsync({
                files: filesToSave,
                projectUuid: null,
                agentUuids: bindToAgentUuid ? [bindToAgentUuid] : [],
            });
            onSaved?.(created.uuid);
        }
        onClose();
    };

    const saving = createSkill.isLoading || updateSkill.isLoading;
    const validation = validate.data;

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
                        disabled={markdown.trim().length === 0}
                    >
                        {isEditing ? 'Save new version' : 'Create skill'}
                    </Button>
                </Group>
            }
        >
            <Stack gap="md">
                {!isEditing ? (
                    <Group grow align="flex-start">
                        <TextInput
                            label="Title"
                            placeholder="Weekly review"
                            value={title}
                            onChange={(event) =>
                                setTitle(event.currentTarget.value)
                            }
                            onBlur={applyTemplate}
                        />
                        <TextInput
                            label="Name"
                            description="The /command and the folder name. Cannot change later."
                            placeholder="weekly-review"
                            value={name}
                            onChange={(event) =>
                                setTypedName(event.currentTarget.value)
                            }
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
                    value={markdown}
                    onChange={(event) => {
                        setTemplateApplied(true);
                        setMarkdown(event.currentTarget.value);
                    }}
                    onBlur={() => validate.mutate(filesToSave)}
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
    onSaved?: (skillUuid: string) => void;
};

/** Loads the current files when editing, then mounts the form once. */
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
                <Group justify="center" py="xl">
                    <Loader size="sm" />
                </Group>
            </MantineModal>
        );
    }
    return (
        <SkillForm
            key={detail.data?.currentVersion.uuid ?? 'new'}
            skill={skill}
            existingFiles={detail.data?.content.files ?? {}}
            {...props}
        />
    );
};
