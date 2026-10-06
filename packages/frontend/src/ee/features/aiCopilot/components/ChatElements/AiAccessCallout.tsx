import { subject } from '@casl/ability';
import { AiAccessRefusalAction, type AiAccessRefusal } from '@lightdash/common';
import { Anchor, Button, Group, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import Callout from '../../../../../components/common/Callout';
import { useProject } from '../../../../../hooks/useProject';
import { useSnowflakeAiLoginPopup } from '../../../../../hooks/useSnowflake';
import useApp from '../../../../../providers/App/useApp';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
export const AiAccessCallout = ({
    refusal,
    projectUuid,
}: {
    refusal: AiAccessRefusal;
    projectUuid: string;
}) => {
    const { user } = useApp();
    const { data: project } = useProject(projectUuid);
    const login = useSnowflakeAiLoginPopup();
    const client = useQueryClient();
    const t = useUiStrings();
    const canUpdate =
        project &&
        user.data?.ability.can('manage', subject('Project', project));
    return (
        <Callout variant="warning">
            <Group gap="xs">
                <Text size="sm">{refusal.message}</Text>
                {refusal.action === AiAccessRefusalAction.SIGN_IN && (
                    <Button
                        size="xs"
                        loading={login.isLoading}
                        onClick={() =>
                            login.mutate(undefined, {
                                onSuccess: () => {
                                    void client.invalidateQueries([
                                        'ai-access',
                                        projectUuid,
                                    ]);
                                },
                            })
                        }
                    >
                        {t('aiAccess.signIn')}
                    </Button>
                )}
                {refusal.action === AiAccessRefusalAction.ASK_ADMIN &&
                    canUpdate && (
                        <Anchor
                            component={Link}
                            to={`/generalSettings/projectManagement/${projectUuid}/aiAccess`}
                            size="sm"
                        >
                            {t('aiAccess.settings')}
                        </Anchor>
                    )}
            </Group>
        </Callout>
    );
};
