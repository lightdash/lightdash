import type { AiAgentMemory, AiAgentMemoryStatus } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Stack,
    Text,
    Textarea,
    Tooltip,
} from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC, type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { usePromoteAiAgentMemory } from '../../hooks/useAiAgentMemory';
import {
    useAiAgentOrgPermission,
    useAiAgentPermission,
} from '../../hooks/useAiAgentPermission';
import { useAiOrganizationSettings } from '../../hooks/useAiOrganizationSettings';

const MEMORY_PROMOTION_FORM_ID = 'memory-promotion-form';

type Props = {
    projectUuid: string;
    memoryUuid: string;
    slug: string;
    status: AiAgentMemoryStatus;
    promotionReviewItem: AiAgentMemory['promotionReviewItem'];
};

export const MemoryPromotionAction: FC<Props> = ({
    projectUuid,
    memoryUuid,
    slug,
    status,
    promotionReviewItem,
}) => {
    const [opened, setOpened] = useState(false);
    const [reason, setReason] = useState('');
    const { data: settings, isLoading: isLoadingSettings } =
        useAiOrganizationSettings();
    const promoteMemory = usePromoteAiAgentMemory();
    const canManageProjectAgent = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });
    const canManageOrganizationAgent = useAiAgentOrgPermission({
        action: 'manage',
    });

    const shouldLinkReviewItem =
        promotionReviewItem &&
        (promotionReviewItem.blocksNewNomination || status === 'promoted');
    if (shouldLinkReviewItem) {
        if (!canManageProjectAgent && !canManageOrganizationAgent) {
            return (
                <Badge variant="light" color="violet" size="lg">
                    {status === 'promoted' ? 'Promoted' : 'Proposal pending'}
                </Badge>
            );
        }
        const params = new URLSearchParams({
            reviewProjectUuid: projectUuid,
            reviewItemUuid: promotionReviewItem.uuid,
        });
        return (
            <Button
                component={Link}
                to={`/generalSettings/ai/issues?${params.toString()}`}
                variant="light"
                color="violet"
                size="xs"
                rightSection={<MantineIcon icon={IconArrowRight} size={14} />}
            >
                View proposal
            </Button>
        );
    }

    const reviewsEnabled =
        settings?.aiAgentReviewsEnabled === true &&
        settings.aiAgentReviewsPausedByByok !== true;
    const disabledReason =
        status !== 'active'
            ? 'Only active memories can be proposed.'
            : !isLoadingSettings && !reviewsEnabled
              ? 'Enable project context reviews before proposing a memory.'
              : null;
    const nominationReason = reason.trim();

    const resetAndClose = () => {
        setOpened(false);
        setReason('');
    };
    const close = () => {
        if (promoteMemory.isLoading) return;
        resetAndClose();
    };
    const submit = (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        promoteMemory.mutate(
            {
                projectUuid,
                memoryUuid,
                slug,
                ...(nominationReason ? { reason: nominationReason } : {}),
            },
            { onSuccess: resetAndClose },
        );
    };

    return (
        <>
            <Tooltip label={disabledReason} disabled={!disabledReason}>
                <Box component="span">
                    <Button
                        variant="default"
                        size="xs"
                        disabled={isLoadingSettings || !!disabledReason}
                        onClick={() => setOpened(true)}
                    >
                        Propose for project context
                    </Button>
                </Box>
            </Tooltip>

            <MantineModal
                opened={opened}
                onClose={close}
                title="Propose memory for project context"
                size="md"
                cancelDisabled={promoteMemory.isLoading}
                actions={
                    <Button
                        type="submit"
                        form={MEMORY_PROMOTION_FORM_ID}
                        loading={promoteMemory.isLoading}
                    >
                        Create proposal
                    </Button>
                }
            >
                <form id={MEMORY_PROMOTION_FORM_ID} onSubmit={submit}>
                    <Stack gap="sm">
                        <Text fz="sm" c="dimmed">
                            This proposes making this guidance available to
                            everyone in the project. Only text from the memory
                            itself is used — evidence and query results are
                            never included — and nothing changes until a
                            reviewer approves it.
                        </Text>
                        <Textarea
                            label="Why should this become project context?"
                            description="Optional — shown to reviewers and used to guide the proposal."
                            value={reason}
                            onChange={(event) =>
                                setReason(event.currentTarget.value)
                            }
                            minRows={3}
                            autosize
                            autoFocus
                        />
                    </Stack>
                </form>
            </MantineModal>
        </>
    );
};
