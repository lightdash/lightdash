import { Anchor, Button, HoverCard, Text } from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import MantineIcon from '../../../components/common/MantineIcon';

export const GoogleSheetsInfoPopover = () => {
    return (
        <HoverCard withinPortal width={300} withArrow>
            <HoverCard.Target>
                <Button
                    size="xs"
                    fz={9}
                    variant="subtle"
                    color="ldGray.3"
                    leftSection={
                        <MantineIcon size={12} icon={IconInfoCircle} />
                    }
                >
                    Google API Services User Data Policy
                </Button>
            </HoverCard.Target>

            <HoverCard.Dropdown>
                <Text fz="9px">
                    Lightdash's use and transfer of information received from
                    Google APIs adhere to{' '}
                    <Anchor
                        target="_blank"
                        href="https://developers.google.com/terms/api-services-user-data-policy"
                        fz="9px"
                    >
                        Google API Services User Data Policy
                    </Anchor>
                    , including the Limited Use requirements.
                </Text>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
