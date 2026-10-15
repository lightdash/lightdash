import { Anchor, Button, HoverCard, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { Trans, useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';

export const GoogleSheetsInfoPopover = () => {
    const { t } = useTranslation('sync');
    return (
        <HoverCard width={300} withArrow>
            <HoverCard.Target>
                <Button
                    size="xs"
                    fz="xs"
                    variant="subtle"
                    color="ldGray.3"
                    leftSection={
                        <MantineIcon size={12} icon={IconInfoCircle} />
                    }
                >
                    {t('googleSheetsInfo.policyName')}
                </Button>
            </HoverCard.Target>

            <HoverCard.Dropdown>
                <Text fz="9px">
                    <Trans
                        t={t}
                        i18nKey="googleSheetsInfo.statement"
                        components={{
                            policyLink: (
                                <Anchor
                                    target="_blank"
                                    href="https://developers.google.com/terms/api-services-user-data-policy"
                                    fz="9px"
                                />
                            ),
                        }}
                    />
                </Text>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
