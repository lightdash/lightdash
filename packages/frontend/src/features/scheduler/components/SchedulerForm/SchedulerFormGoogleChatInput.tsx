import { Anchor, Box, Group, Text, Tooltip } from '@mantine-8/core';
import { type FC } from 'react';
import { PillTagsInput } from '../../../../components/common/TagsInput/PillTagsInput';
import { TagPill } from '../../../../components/common/TagsInput/TagPill';
import GoogleChatSvg from '../../../../svgs/googlechat.svg?react';
import classes from './SchedulerWebhookPill.module.css';

type GoogleChatDestinationProps = {
    onChange: (val: string[]) => void;
    googleChatTargets: string[];
    /** Omit the leading icon when the parent renders its own destination label */
    hideIcon?: boolean;
};

const renderWebhookPill = ({
    value,
    onRemove,
}: {
    value: string;
    onRemove: () => void;
}) => (
    <Tooltip label={value} withinPortal multiline w="500px">
        <TagPill
            label={value}
            onRemove={onRemove}
            className={classes.webhookPill}
        />
    </Tooltip>
);

const validateGoogleChatWebhook = (webhook: string): boolean => {
    if (webhook.length === 0) return false;
    if (!webhook.startsWith('https://')) return false;
    if (/\s/.test(webhook)) return false;

    return true;
};

export const SchedulerFormGoogleChatInput: FC<GoogleChatDestinationProps> = ({
    onChange,
    googleChatTargets,
    hideIcon,
}) => {
    return (
        <Group wrap="nowrap" mb={hideIcon ? 0 : 'sm'} align="flex-start">
            {!hideIcon && (
                <Box pt="xxs">
                    <GoogleChatSvg
                        style={{
                            margin: '5px 2px',
                            width: '20px',
                            height: '20px',
                        }}
                    />
                </Box>
            )}
            <Box w="100%">
                <PillTagsInput
                    radius="md"
                    clearable
                    placeholder="Enter Google Chat webhook URLs"
                    value={googleChatTargets}
                    allowDuplicates={false}
                    splitChars={[',', ' ']}
                    validate={validateGoogleChatWebhook}
                    onChange={onChange}
                    renderPill={renderWebhookPill}
                />
                <Text size="xs" c="dimmed" mt={4}>
                    <Anchor
                        size="xs"
                        href="https://developers.google.com/workspace/chat/create-webhook"
                        target="_blank"
                    >
                        Create a webhook
                    </Anchor>{' '}
                    in Google Chat to get a URL.
                </Text>
            </Box>
        </Group>
    );
};
