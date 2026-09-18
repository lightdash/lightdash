import { Button, Group } from '@mantine/core';
import { IconBrandApple, IconBrandGooglePlay } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    playStoreUrl: string;
    appStoreUrl: string | null;
};

export const AppStoreBadges: FC<Props> = ({ playStoreUrl, appStoreUrl }) => (
    <Group gap="xs">
        {appStoreUrl ? (
            <Button
                component="a"
                href={appStoreUrl}
                target="_blank"
                rel="noreferrer"
                variant="default"
                leftSection={<MantineIcon icon={IconBrandApple} />}
            >
                Download on the App Store
            </Button>
        ) : null}
        <Button
            component="a"
            href={playStoreUrl}
            target="_blank"
            rel="noreferrer"
            variant="default"
            leftSection={<MantineIcon icon={IconBrandGooglePlay} />}
        >
            Get it on Google Play
        </Button>
    </Group>
);
