import {
    getExpiredPersonalSignInMessage,
    getExpiredSharedSignInMessage,
    type SharedSignInStatus,
} from '@lightdash/common';
import { Anchor, Group, Text } from '@mantine/core';
import classes from './WarehouseSignInBanner.module.css';

export const WarehouseSignInBanner = ({
    status,
    userUuid,
    reconnect,
}: {
    status: SharedSignInStatus;
    userUuid: string;
    reconnect: () => void;
}) => (
    <Group className={classes.banner} gap="sm" wrap="nowrap">
        <Text size="sm" fw={600} truncate>
            {status.personalSignIn
                ? getExpiredPersonalSignInMessage(status.personalSignIn)
                : getExpiredSharedSignInMessage(
                      {
                          provider: status.provider,
                          subjectUserUuid: status.subject?.userUuid ?? null,
                          subjectName: status.subject?.name ?? null,
                          subjectBasis: status.subjectBasis,
                      },
                      userUuid,
                  )}
        </Text>
        {(status.personalSignIn?.canReconnect ?? status.canReconnect) && (
            <Anchor
                component="button"
                className={classes.action}
                onClick={reconnect}
                size="sm"
                fw={600}
            >
                Reconnect
            </Anchor>
        )}
    </Group>
);
