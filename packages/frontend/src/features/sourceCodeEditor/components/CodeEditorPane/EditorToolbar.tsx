import { Breadcrumbs, Button, Group, Loader, Text } from '@mantine/core';
import {
    IconDeviceFloppy,
    IconGitPullRequest,
    IconLock,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../components/common/MantineIcon';

type EditorToolbarProps = {
    filePath: string | null;
    hasUnsavedChanges: boolean;
    isProtectedBranch: boolean;
    canManage: boolean;
    isSaving: boolean;
    onSave: () => void;
    onCreatePR: () => void;
};

const EditorToolbar: FC<EditorToolbarProps> = ({
    filePath,
    hasUnsavedChanges,
    isProtectedBranch,
    canManage,
    isSaving,
    onSave,
    onCreatePR,
}) => {
    const { t } = useTranslation('sourceCode');
    const pathParts = filePath?.split('/').filter(Boolean) ?? [];
    const canSave = canManage && !isProtectedBranch && hasUnsavedChanges;
    const canCreatePR = canManage && !isProtectedBranch && !hasUnsavedChanges;

    return (
        <Group justify="space-between" p="sm" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
                {filePath ? (
                    <>
                        <Breadcrumbs separatorMargin={4}>
                            {pathParts.map((part, index) => (
                                <Text
                                    key={index}
                                    fz="sm"
                                    c={
                                        index === pathParts.length - 1
                                            ? undefined
                                            : 'ldGray.5'
                                    }
                                    fw={
                                        index === pathParts.length - 1
                                            ? 500
                                            : undefined
                                    }
                                >
                                    {part}
                                </Text>
                            ))}
                        </Breadcrumbs>
                        {hasUnsavedChanges && (
                            <Text fz="xs" c="ldGray.5">
                                {t('toolbar.modified')}
                            </Text>
                        )}
                    </>
                ) : (
                    <Text fz="sm" c="ldGray.5">
                        {t('toolbar.selectFile')}
                    </Text>
                )}
            </Group>

            <Group gap="xs">
                {isProtectedBranch && filePath && (
                    <Group gap={4}>
                        <MantineIcon
                            icon={IconLock}
                            color="ldGray.5"
                            size={14}
                        />
                        <Text fz="xs" c="ldGray.5">
                            {t('toolbar.readOnly')}
                        </Text>
                    </Group>
                )}

                {filePath && canManage && !isProtectedBranch && (
                    <>
                        <Button
                            size="xs"
                            variant={hasUnsavedChanges ? 'filled' : 'subtle'}
                            leftSection={
                                isSaving ? (
                                    <Loader size={14} />
                                ) : (
                                    <MantineIcon icon={IconDeviceFloppy} />
                                )
                            }
                            disabled={!canSave || isSaving}
                            onClick={onSave}
                        >
                            {t('actions.save', { ns: 'common' })}
                        </Button>
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={
                                <MantineIcon icon={IconGitPullRequest} />
                            }
                            disabled={!canCreatePR}
                            onClick={onCreatePR}
                        >
                            {t('toolbar.createPullRequest')}
                        </Button>
                    </>
                )}
            </Group>
        </Group>
    );
};

export default EditorToolbar;
