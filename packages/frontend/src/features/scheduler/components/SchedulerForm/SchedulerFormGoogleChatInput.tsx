import { Anchor, Box, Group, Text, Tooltip } from '@mantine-8/core';
import { type FC } from 'react';
import { DefaultValue } from '../../../../components/common/TagInput/DefaultValue/DefaultValue';
import { TagInput } from '../../../../components/common/TagInput/TagInput';
import GoogleChatSvg from '../../../../svgs/googlechat.svg?react';

type GoogleChatDestinationProps = {
    onChange: (val: string[]) => void;
    googleChatTargets: string[];
};

const withTooltip = (Component: FC<any>) => {
    return ({ value, onRemove, ...props }: any) => (
        <Tooltip label={value} withinPortal multiline w="500px">
            <Component value={value} onRemove={onRemove} {...props} />
        </Tooltip>
    );
};

const RenderValueWithTooltip = withTooltip(DefaultValue);

const validateGoogleChatWebhook = (webhook: string): boolean => {
    if (webhook.length === 0) return false;
    if (!webhook.startsWith('https://')) return false;
    if (/\s/.test(webhook)) return false;

    return true;
};

export const SchedulerFormGoogleChatInput: FC<GoogleChatDestinationProps> = ({
    onChange,
    googleChatTargets,
}) => {
    return (
        <Group wrap="nowrap" mb="sm" align="flex-start">
            <Box pt="xxs">
                <GoogleChatSvg
                    style={{
                        margin: '5px 2px',
                        width: '20px',
                        height: '20px',
                    }}
                />
            </Box>
            <Box w="100%">
                <TagInput
                    sx={{
                        span: {
                            maxWidth: '280px',
                        },
                    }}
                    radius="md"
                    clearable
                    placeholder="Enter Google Chat webhook URLs"
                    value={googleChatTargets}
                    allowDuplicates={false}
                    splitChars={[',', ' ']}
                    validationFunction={validateGoogleChatWebhook}
                    onChange={onChange}
                    valueComponent={RenderValueWithTooltip}
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
