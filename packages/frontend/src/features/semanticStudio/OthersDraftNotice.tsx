import { type SemanticLayerDrafter } from '@lightdash/common';
import { Badge, Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import { ChangeDiff } from './ChangeDiff';
import { describeDrafter, listDraftedParts } from './modelCode';
import {
    useDiscardOthersDraftModel,
    useOthersDraftModel,
    type PublishMode,
} from './useSemanticLayerModel';

/** What another draft of the same model means for the viewer, as reconciliation decides it. */
const describeOverlap = (publishMode: PublishMode): string =>
    publishMode === 'live'
        ? 'You can still make changes. If you both change the same field, whoever publishes second is asked which version to keep.'
        : 'You can still make changes. Each draft is sent as its own pull request.';

const ViewChangesModal: FC<{
    projectUuid: string;
    model: string;
    drafter: SemanticLayerDrafter;
    onClose: () => void;
}> = ({ projectUuid, model, drafter, onClose }) => {
    const { data, error } = useOthersDraftModel(
        projectUuid,
        drafter.userUuid,
        model,
        true,
    );
    return (
        <MantineModal
            opened
            onClose={onClose}
            title={`${drafter.name}'s draft of ${model}`}
            subtitle="Read only. Only they can publish or discard it."
            size="xl"
        >
            {data ? (
                <ChangeDiff modelName={model} change={data} variant="full" />
            ) : (
                <Text fz="sm" c="dimmed">
                    {error ? error.error.message : 'Loading their changes…'}
                </Text>
            )}
        </MantineModal>
    );
};

const DrafterRow: FC<{
    projectUuid: string;
    model: string;
    drafter: SemanticLayerDrafter;
}> = ({ projectUuid, model, drafter }) => {
    const [open, setOpen] = useState<'view' | 'discard' | null>(null);
    const discard = useDiscardOthersDraftModel(projectUuid);
    return (
        <Group gap="xs" wrap="nowrap" align="center">
            <MantineIcon icon={IconUsers} color="dimmed" />
            <Tooltip
                label={listDraftedParts(drafter.paths).join(', ')}
                disabled={drafter.paths.length === 0}
                multiline
                maw={360}
                withinPortal
            >
                <Text fz="xs" c="dimmed">
                    {describeDrafter(drafter)}
                </Text>
            </Tooltip>
            {drafter.isStale ? (
                <Badge size="xs" variant="light" color="yellow" tt="none">
                    stale
                </Badge>
            ) : null}
            <Button
                size="compact-xs"
                variant="subtle"
                onClick={() => setOpen('view')}
            >
                View changes
            </Button>
            {drafter.canDiscard ? (
                <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    onClick={() => setOpen('discard')}
                >
                    Discard draft
                </Button>
            ) : null}
            {open === 'view' ? (
                <ViewChangesModal
                    projectUuid={projectUuid}
                    model={model}
                    drafter={drafter}
                    onClose={() => setOpen(null)}
                />
            ) : null}
            <MantineModal
                opened={open === 'discard'}
                onClose={() => setOpen(null)}
                variant="delete"
                title={`Discard ${drafter.name}'s draft of ${model}?`}
                description={`This removes their unpublished changes to ${model} for them too, and cannot be undone. Their changes to other models stay.`}
                confirmLabel="Discard draft"
                confirmLoading={discard.isLoading}
                onConfirm={() =>
                    discard.mutate(
                        { ownerUuid: drafter.userUuid, model },
                        { onSuccess: () => setOpen(null) },
                    )
                }
            />
        </Group>
    );
};

/** Other people's drafts of this model: who, what, how recent, and what it means for the viewer. */
export const OthersDraftNotice: FC<{
    projectUuid: string;
    model: string;
    drafters: SemanticLayerDrafter[];
    publishMode: PublishMode;
}> = ({ projectUuid, model, drafters, publishMode }) =>
    drafters.length === 0 ? null : (
        <Stack gap={4} mb="sm">
            {drafters.map((drafter) => (
                <DrafterRow
                    key={drafter.userUuid}
                    projectUuid={projectUuid}
                    model={model}
                    drafter={drafter}
                />
            ))}
            <Text fz="xs" c="dimmed">
                {describeOverlap(publishMode)}
            </Text>
        </Stack>
    );
