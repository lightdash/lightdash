import { subject } from '@casl/ability';
import {
    ExternalSourceType,
    type Explore,
    type ExternalSourceRef,
} from '@lightdash/common';
import { ActionIcon, Menu, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconDots,
    IconGitMerge,
    IconInfoCircle,
    IconPencil,
    IconTrash,
    IconUpload,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import useApp from '../../../providers/App/useApp';
import { DeleteExternalSourceModal } from './DeleteExternalSourceModal';
import { RenameExternalSourceModal } from './RenameExternalSourceModal';
import { ReplaceCsvFileModal } from './ReplaceCsvFileModal';
import { SourceTablePreviewDrawer } from './SourceTablePreviewDrawer';

type Props = {
    projectUuid: string;
    explore: Explore;
    sourceRef: ExternalSourceRef;
    canMergeAnotherQuery: boolean;
    onAddMergeSource: () => void;
};

export const ExternalSourceExploreMenu: FC<Props> = ({
    projectUuid,
    explore,
    sourceRef,
    canMergeAnotherQuery,
    onAddMergeSource,
}) => {
    const navigate = useNavigate();
    const { user } = useApp();
    const canManage =
        user.data?.ability.can(
            'manage',
            subject('ExternalSource', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) === true;

    const [isRenameOpen, renameHandlers] = useDisclosure(false);
    const [isReplaceOpen, replaceHandlers] = useDisclosure(false);
    const [isDeleteOpen, deleteHandlers] = useDisclosure(false);
    const [previewRef, setPreviewRef] = useState<ExternalSourceRef>();

    if (!canManage && !canMergeAnotherQuery) {
        return null;
    }

    return (
        <>
            <Menu withArrow offset={-2}>
                <Menu.Target>
                    <ActionIcon
                        aria-label="External source actions"
                        color="gray"
                        variant="transparent"
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    {canMergeAnotherQuery && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconGitMerge} />}
                            onClick={onAddMergeSource}
                        >
                            <Text fz="xs" fw={500}>
                                Merge another query
                            </Text>
                        </Menu.Item>
                    )}
                    {canMergeAnotherQuery && canManage && <Menu.Divider />}
                    {canManage && (
                        <>
                            {sourceRef.sourceType ===
                                ExternalSourceType.CSV && (
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconUpload} />
                                    }
                                    onClick={replaceHandlers.open}
                                >
                                    <Text fz="xs" fw={500}>
                                        Replace file
                                    </Text>
                                </Menu.Item>
                            )}
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconPencil} />}
                                onClick={renameHandlers.open}
                            >
                                <Text fz="xs" fw={500}>
                                    Rename table
                                </Text>
                            </Menu.Item>
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconInfoCircle} />
                                }
                                onClick={() => setPreviewRef(sourceRef)}
                            >
                                <Text fz="xs" fw={500}>
                                    View source details
                                </Text>
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconTrash} />}
                                color="red"
                                onClick={deleteHandlers.open}
                            >
                                <Text fz="xs" fw={500}>
                                    Delete
                                </Text>
                            </Menu.Item>
                        </>
                    )}
                </Menu.Dropdown>
            </Menu>
            {isRenameOpen && (
                <RenameExternalSourceModal
                    projectUuid={projectUuid}
                    sourceRef={sourceRef}
                    currentLabel={explore.label}
                    opened={isRenameOpen}
                    onClose={renameHandlers.close}
                />
            )}
            {isReplaceOpen && (
                <ReplaceCsvFileModal
                    projectUuid={projectUuid}
                    sourceRef={sourceRef}
                    tableLabel={explore.label}
                    opened={isReplaceOpen}
                    onClose={replaceHandlers.close}
                />
            )}
            {isDeleteOpen && (
                <DeleteExternalSourceModal
                    projectUuid={projectUuid}
                    sourceRef={sourceRef}
                    tableLabel={explore.label}
                    opened={isDeleteOpen}
                    onClose={deleteHandlers.close}
                    onDeleted={() =>
                        navigate(`/projects/${projectUuid}/tables`)
                    }
                />
            )}
            <SourceTablePreviewDrawer
                projectUuid={projectUuid}
                sourceRef={previewRef}
                tableLabel={explore.label}
                onClose={() => setPreviewRef(undefined)}
            />
        </>
    );
};
