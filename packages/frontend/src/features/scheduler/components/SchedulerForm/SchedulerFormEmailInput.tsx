import { validateEmail } from '@lightdash/common';
import { Anchor, Box, Group, HoverCard, TagsInput, Text } from '@mantine/core';
import { IconMail } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import MantineIcon from '../../../../components/common/MantineIcon';
import useHealth from '../../../../hooks/health/useHealth';

type Props = {
    value: string[];
    onChange: (val: string[]) => void;
    /** Omit the leading icon when the parent renders its own destination label */
    hideIcon?: boolean;
};

export const SchedulerFormEmailInput: FC<Props> = ({
    value,
    onChange,
    hideIcon,
}) => {
    const { t } = useTranslation('scheduler');
    const health = useHealth();
    const isDisabled = !health.data?.hasEmailClient;
    const [validationError, setValidationError] = useState<string>();

    return (
        <Group wrap="nowrap">
            {!hideIcon && (
                <MantineIcon icon={IconMail} size="xl" color="ldGray.7" />
            )}
            <HoverCard
                disabled={!isDisabled}
                width={300}
                position="bottom-start"
            >
                <HoverCard.Target>
                    <Box w="100%">
                        <TagsInput
                            clearable
                            error={validationError || null}
                            placeholder={t('emailInput.placeholder')}
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
                                        t('emailInput.invalidEmail', {
                                            email: invalid,
                                        }),
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
                        {t('emailInput.noIntegration')}
                    </Text>
                    <Text fz="xs">
                        <Trans
                            t={t}
                            i18nKey="emailInput.setupSmtp"
                            components={{
                                anchor: (
                                    <Anchor
                                        fz="xs"
                                        fw={500}
                                        target="_blank"
                                        href="https://docs.lightdash.com/self-host/customize-deployment/configure-smtp-for-lightdash-email-notifications"
                                    />
                                ),
                            }}
                        />
                    </Text>
                </HoverCard.Dropdown>
            </HoverCard>
        </Group>
    );
};
