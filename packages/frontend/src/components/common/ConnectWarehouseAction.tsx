import { Button, type ButtonProps } from '@mantine/core';
import { type FC } from 'react';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import {
    requestWarehouseCredentialsPrompt,
    useHasWarehouseCredentialsPrompt,
} from '../../hooks/userWarehouseCredentials/warehouseCredentialsError';
import { getWarehouseLabel } from '../ProjectConnection/ProjectConnectFlow/utils';

const MISSING_CREDENTIALS = 'MissingWarehouseCredentialsError';

const ConnectWarehouseButton: FC<ButtonProps> = (props) => {
    const hasPrompt = useHasWarehouseCredentialsPrompt();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);
    const warehouseConnection = project?.warehouseConnection;

    if (
        !hasPrompt ||
        !activeProjectUuid ||
        !warehouseConnection?.requireUserCredentials
    ) {
        return null;
    }

    return (
        <Button
            size="xs"
            variant="default"
            onClick={() => requestWarehouseCredentialsPrompt(activeProjectUuid)}
            {...props}
        >
            Connect {getWarehouseLabel(warehouseConnection.type)}
        </Button>
    );
};

type Props = ButtonProps & {
    error: { name?: string } | null | undefined;
};

/**
 * Opens the navbar's warehouse login prompt from a missing-credentials error.
 * Renders nothing for any other error.
 */
export const ConnectWarehouseAction: FC<Props> = ({ error, ...rest }) =>
    error?.name === MISSING_CREDENTIALS ? (
        <ConnectWarehouseButton {...rest} />
    ) : null;
