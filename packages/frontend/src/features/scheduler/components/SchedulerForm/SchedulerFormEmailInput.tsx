import { validateEmail } from '@lightdash/common';
import {
    Anchor,
    Box,
    Group,
    HoverCard,
    TagsInput,
    Text,
} from '@mantine-8/core';
import { IconMail } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import useHealth from '../../../../hooks/health/useHealth';

type Props = {
    value: string[];
    onChange: (val: string[]) => void;
};

/**
 * Email destination row for scheduled deliveries — icon + validated tags input.
 */
export const SchedulerFormEmailInput: FC<Props> = ({ value, onChange }) => {
    const health = useHealth();
    const isDisabled = !health.data?.hasEmailClient;
    const [validationError, setValidationError] = useState<string>();

    return (
        <Group wrap="nowrap">
            <MantineIcon icon={IconMail} size="xl" color="ldGray.7" />
            <HoverCard
                disabled={!isDisabled}
                width={300}
                position="bottom-start"
                shadow="md"
            >
                <HoverCard.Target>
                    <Box w="100%">
                        <TagsInput
                            radius="md"
                            clearable
                            error={validationError || null}
                            placeholder="Enter email addresses"
                            disabled={isDisabled}
                            value={value}
                            allowDuplicates={false}
                            splitChars={[',', ' ']}
                            onBlur={() => setValidationError(undefined)}
                            onChange={(val: string[]) => {
                                const added = val.filter(
                                    (v) => !value.includes(v),
                                );
                                const invalid = added.find(
                                    (v) => !validateEmail(v),
                                );
                                if (invalid) {
                                    setValidationError(
                                        `'${invalid}' doesn't appear to be an email address`,
                                    );
                                    onChange(val.filter(validateEmail));
                                    return;
                                }
                                setValidationError(undefined);
                                onChange(val);
                            }}
                        />
                    </Box>
                </HoverCard.Target>
                <HoverCard.Dropdown>
                    <Text fz="xs" fw={500}>
                        No Email integration found.
                    </Text>
                    <Text fz="xs">
                        To create an email scheduled delivery, you need to add
                        <Anchor
                            fz="xs"
                            fw={500}
                            target="_blank"
                            href="https://docs.lightdash.com/self-host/customize-deployment/configure-smtp-for-lightdash-email-notifications"
                        >
                            {' '}
                            SMTP environment variables{' '}
                        </Anchor>
                        to your Lightdash instance
                    </Text>
                </HoverCard.Dropdown>
            </HoverCard>
        </Group>
    );
};
