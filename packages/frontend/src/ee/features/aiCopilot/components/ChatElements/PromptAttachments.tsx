import {
    composerNodeContextKey,
    isTabularThreadFileName,
    type AiPromptContextItem,
} from '@lightdash/common';
import { ActionIcon, Group, Loader, Pill, Stack, Tooltip } from '@mantine/core';
import { IconFileText, IconSitemap, IconX } from '@tabler/icons-react';
import { TableIcon } from '../../../../../components/common/ContentIcons';
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
                <Pill.Group>
                    {externalSources.map((attachment) => (
                        <Pill
                            key={attachment.sourceUuid}
                            disabled={disabled}
                            withRemoveButton
                            onRemove={() =>
                                onRemoveExternalSource(attachment.sourceUuid)
                            }
                        >
                            {attachment.displayName}
                            {attachment.tables.length > 1
                                ? ` · ${attachment.tables.length} tables`
                                : ''}
                        </Pill>
                    ))}
                    {pendingCsvFiles.map((file) => (
                        <Pill key={file.id}>
                            <Group gap="xs" wrap="nowrap">
                                {file.status === 'preparing' && (
                                    <Loader size={10} />
                                )}
                                {file.status === 'queued'
                                    ? 'Queued'
                                    : 'Preparing'}{' '}
                                {file.filename}
                            </Group>
                        </Pill>
                    ))}
                    {documents.map((attachment) => (
                        <Pill
                            key={attachment.fileUuid}
                            disabled={disabled}
                            withRemoveButton
                            onRemove={() =>
                                onRemoveThreadFile(attachment.fileUuid)
                            }
                        >
                            <Group gap="xs" wrap="nowrap">
                                <MantineIcon
                                    icon={
                                        isTabularThreadFileName(
                                            attachment.fileName,
                                        )
                                            ? TableIcon
                                            : IconFileText
                                    }
                                    size={12}
                                />
                                {attachment.fileName}
                            </Group>
                        </Pill>
                    ))}
                    {pendingThreadFiles.map((file) => (
                        <Pill
                            key={`upload-${file.id}`}
                            disabled={disabled}
                            withRemoveButton
                            removeButtonProps={{
                                'aria-label': `Cancel ${file.filename}`,
                            }}
                            onRemove={() => onCancelPendingFile(file.id)}
                        >
                            <Group gap="xs" wrap="nowrap">
                                <Loader size={10} />
                                {pendingLabels[file.status]} {file.filename}
                            </Group>
                        </Pill>
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
                        <Pill
                            key={composerNodeContextKey(node)}
                            disabled={disabled}
                            withRemoveButton
                            onRemove={() => onRemoveComposerNode(node)}
                        >
                            <Group gap="xs" wrap="nowrap">
                                <MantineIcon icon={IconSitemap} size={12} />
                                {node.title}
                            </Group>
                        </Pill>
                    ))}
                </Pill.Group>
            )}
        </Stack>
    );
};
