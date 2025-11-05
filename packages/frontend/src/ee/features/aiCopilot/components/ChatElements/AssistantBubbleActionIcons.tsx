import {
    ActionIcon,
    Button,
    CopyButton,
    Group,
    Popover,
    Stack,
    Textarea,
    Tooltip,
} from '@mantine-8/core';
import {
    IconBug,
    IconCheck,
    IconCopy,
    IconTestPipe,
    IconThumbDown,
    IconThumbDownFilled,
    IconThumbUp,
    IconThumbUpFilled,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './AssistantBubbleActionIcons.module.css';

type Props = {
    messageContent: string;
    hasRating: boolean;
    upVoted: boolean;
    downVoted: boolean;
    onUpvote: () => void;
    onDownvote: () => void;
    showAddToEvalsButton?: boolean;
    onAddToEvals?: (promptUuid: string) => void;
    messageUuid: string;
    isArtifactAvailable: boolean;
    onOpenDebug: () => void;
    popoverOpened: boolean;
    closePopover: () => void;
    handleSubmitFeedback: (feedback: string) => void;
    handleCancelFeedback: () => void;
};

export const AssistantBubbleActionIcons: FC<Props> = ({
    messageContent,
    hasRating,
    upVoted,
    downVoted,
    onUpvote,
    onDownvote,
    showAddToEvalsButton,
    onAddToEvals,
    messageUuid,
    isArtifactAvailable,
    onOpenDebug,
    popoverOpened,
    closePopover,
    handleSubmitFeedback,
    handleCancelFeedback,
}) => {
    return (
        <Group gap={0}>
            <CopyButton value={messageContent}>
                {({ copied, copy }) => (
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="copy"
                        onClick={copy}
                    >
                        <MantineIcon icon={copied ? IconCheck : IconCopy} />
                    </ActionIcon>
                )}
            </CopyButton>

            {(!hasRating || upVoted) && (
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="upvote"
                    onClick={onUpvote}
                >
                    <Tooltip
                        label="Feedback sent"
                        position="top"
                        withinPortal
                        withArrow
                        // Hack to only render tooltip (on hover) when `hasRating` is false
                        opened={hasRating ? undefined : false}
                    >
                        <MantineIcon
                            icon={upVoted ? IconThumbUpFilled : IconThumbUp}
                        />
                    </Tooltip>
                </ActionIcon>
            )}

            {(!hasRating || downVoted) && (
                <Popover
                    width={500}
                    position="top-start"
                    trapFocus
                    opened={popoverOpened}
                    onClose={closePopover}
                    withArrow
                >
                    <Popover.Target>
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="downvote"
                            onClick={onDownvote}
                        >
                            <MantineIcon
                                icon={
                                    downVoted
                                        ? IconThumbDownFilled
                                        : IconThumbDown
                                }
                            />
                        </ActionIcon>
                    </Popover.Target>
                    <Popover.Dropdown>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                const feedback = formData.get(
                                    'feedback',
                                ) as string;
                                if (feedback.trim().length !== 0) {
                                    handleSubmitFeedback(feedback);
                                }
                            }}
                        >
                            <Stack gap="xs">
                                <Textarea
                                    autoFocus
                                    classNames={{
                                        input: styles.feedbackInput,
                                    }}
                                    placeholder="Tell us what went wrong, feedback will be added to agent context (optional)"
                                    minRows={3}
                                    maxRows={5}
                                    radius="md"
                                    resize="vertical"
                                    name="feedback"
                                />
                                <Group gap="xs">
                                    <Button
                                        type="submit"
                                        size="xs"
                                        color="dark.5"
                                    >
                                        Submit
                                    </Button>
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="subtle"
                                        onClick={handleCancelFeedback}
                                    >
                                        Cancel
                                    </Button>
                                </Group>
                            </Stack>
                        </form>
                    </Popover.Dropdown>
                </Popover>
            )}

            {showAddToEvalsButton && onAddToEvals && (
                <Tooltip label="Add this response to evals">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Add to evaluation set"
                        onClick={() => onAddToEvals(messageUuid)}
                    >
                        <MantineIcon icon={IconTestPipe} color="gray" />
                    </ActionIcon>
                </Tooltip>
            )}

            {isArtifactAvailable && (
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="Debug information"
                    onClick={onOpenDebug}
                >
                    <MantineIcon icon={IconBug} color="gray" />
                </ActionIcon>
            )}
        </Group>
    );
};
