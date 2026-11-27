import {
    composerNodeContextKey,
    isTabularThreadFileName,
    type AiPromptContextItem,
} from '@lightdash/common';
import { ActionIcon, Box, Loader, Stack, Tooltip } from '@mantine/core';
import {
    IconFileText,
    IconSitemap,
    IconTable,
    IconX,
} from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ElementRefPill } from '../../../../../features/apps/components/ElementRefPill';
import {
    elementRefKey,
    type ElementRef,
} from '../../../../../features/apps/utils/elementRefs';
import { type PendingCsvSource } from '../../hooks/useCsvSourceAttachment';
import {
    type PendingThreadFile,
    type ThreadFileAttachment,
} from '../../hooks/useThreadFileAttachment';
import { type ThreadComposerNode } from '../../store/aiAgentThreadComposerNodesSlice';
import { ComposerChip } from './ComposerChip';
import styles from './PromptAttachments.module.css';
import { ThreadImageCard, ThreadImageGrid } from './ThreadImageCard';

export type ExternalSourceAttachment = Extract<
    AiPromptContextItem,
    { type: 'external_source' }
>;
type Props<T extends ElementRef> = {
    externalSources: ExternalSourceAttachment[];
    onRemoveExternalSource: (sourceUuid: string) => void;
    pendingCsvFiles: PendingCsvSource[];
    threadFiles: ThreadFileAttachment[];
    onRemoveThreadFile: (fileUuid: string) => void;
    pendingThreadFiles: PendingThreadFile[];
    onCancelPendingFile: (id: number) => void;
    elementRefs: T[];
    onRemoveElementRef: (ref: T) => void;
    composerNodes: ThreadComposerNode[];
    onRemoveComposerNode: (node: ThreadComposerNode) => void;
    disabled?: boolean;
};
const pendingLabels = {
    preparing: 'Preparing',
    uploading: 'Uploading',
} satisfies Record<PendingThreadFile['status'], string>;

/** Ready image previews are local-only; sent messages render immutable metadata instead. */
export const PromptAttachments = <T extends ElementRef>({
    externalSources,
    onRemoveExternalSource,
    pendingCsvFiles,
    threadFiles,
    onRemoveThreadFile,
    pendingThreadFiles,
    onCancelPendingFile,
    elementRefs,
    onRemoveElementRef,
    composerNodes,
    onRemoveComposerNode,
    disabled = false,
}: Props<T>) => {
    const images = threadFiles.filter((file) => file.type === 'thread_image');
    const documents = threadFiles.filter((file) => file.type === 'thread_file');
    const hasPills =
        externalSources.length +
            pendingCsvFiles.length +
            documents.length +
            pendingThreadFiles.length +
            elementRefs.length +
            composerNodes.length >
        0;
    return (
        <Stack gap="xs">
            {images.length > 0 && (
                <ThreadImageGrid>
                    {images.map((attachment) => (
                        <ThreadImageCard
                            key={attachment.fileUuid}
                            fileName={attachment.fileName}
                            width={attachment.width}
                            height={attachment.height}
                            previewUrl={attachment.previewUrl}
                            layout="grid"
                            action={
                                <Tooltip
                                    label={`Remove ${attachment.fileName}`}
                                >
                                    <ActionIcon
                                        size="xs"
                                        disabled={disabled}
                                        aria-label={`Remove ${attachment.fileName}`}
                                        onClick={() =>
                                            onRemoveThreadFile(
                                                attachment.fileUuid,
                                            )
                                        }
                                    >
                                        <MantineIcon icon={IconX} size={14} />
                                    </ActionIcon>
                                </Tooltip>
                            }
                        />
                    ))}
                </ThreadImageGrid>
            )}
            {hasPills && (
                <Box className={styles.chips}>
                    {externalSources.map((attachment) => (
                        <ComposerChip
                            key={attachment.sourceUuid}
                            icon={<MantineIcon icon={IconTable} size={14} />}
                            label={
                                attachment.tables.length > 1
                                    ? `${attachment.displayName} · ${attachment.tables.length} tables`
                                    : attachment.displayName
                            }
                            remove={{
                                label: `Remove ${attachment.displayName}`,
                                onClick: () =>
                                    onRemoveExternalSource(
                                        attachment.sourceUuid,
                                    ),
                            }}
                            disabled={disabled}
                        />
                    ))}
                    {pendingCsvFiles.map((file) => (
                        <ComposerChip
                            key={file.id}
                            icon={
                                file.status === 'preparing' ? (
                                    <Loader size={10} />
                                ) : null
                            }
                            label={`${file.status === 'queued' ? 'Queued' : 'Preparing'} ${file.filename}`}
                            remove={null}
                            disabled={false}
                        />
                    ))}
                    {documents.map((attachment) => (
                        <ComposerChip
                            key={attachment.fileUuid}
                            icon={
                                <MantineIcon
                                    icon={
                                        isTabularThreadFileName(
                                            attachment.fileName,
                                        )
                                            ? IconTable
                                            : IconFileText
                                    }
                                    size={14}
                                />
                            }
                            label={attachment.fileName}
                            remove={{
                                label: `Remove ${attachment.fileName}`,
                                onClick: () =>
                                    onRemoveThreadFile(attachment.fileUuid),
                            }}
                            disabled={disabled}
                        />
                    ))}
                    {pendingThreadFiles.map((file) => (
                        <ComposerChip
                            key={`upload-${file.id}`}
                            icon={<Loader size={10} />}
                            label={`${pendingLabels[file.status]} ${file.filename}`}
                            remove={{
                                label: `Cancel ${file.filename}`,
                                onClick: () => onCancelPendingFile(file.id),
                            }}
                            disabled={disabled}
                        />
                    ))}
                    {elementRefs.map((ref) => (
                        <ElementRefPill
                            key={elementRefKey(ref)}
                            elementRef={ref}
                            onRemove={
                                disabled
                                    ? undefined
                                    : () => onRemoveElementRef(ref)
                            }
                        />
                    ))}
                    {composerNodes.map((node) => (
                        <ComposerChip
                            key={composerNodeContextKey(node)}
                            icon={<MantineIcon icon={IconSitemap} size={14} />}
                            label={node.title}
                            remove={{
                                label: `Remove ${node.title}`,
                                onClick: () => onRemoveComposerNode(node),
                            }}
                            disabled={disabled}
                        />
                    ))}
                </Box>
            )}
        </Stack>
    );
};
