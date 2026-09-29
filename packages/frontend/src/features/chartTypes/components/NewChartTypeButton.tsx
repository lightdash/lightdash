import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Button, type ButtonProps } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';
import { useCanManageOrganizationChartTypes } from '../hooks/useOrganizationLibraryAccess';
import { chartTypeBuilderPath } from '../utils/chartTypeBuilderPath';
import { type ChartTypeOwner } from '../utils/chartTypeOwner';

type Props = {
    /** The project the gallery is viewed from */
    projectUuid: string;
    owner: ChartTypeOwner;
    size: ButtonProps['size'];
    mt?: ButtonProps['mt'];
};

/** Opens Chart Studio on a new chart type, for users who can build one. */
const NewChartTypeButton: FC<Props> = ({ projectUuid, owner, size, mt }) => {
    const { user } = useApp();
    const ability = useAbilityContext();
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    // Building a new chart type is authoring, so it needs data apps.
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const canManageOrganizationChartTypes =
        useCanManageOrganizationChartTypes();
    const canCreate =
        owner === 'organization'
            ? canManageOrganizationChartTypes
            : dataAppsEnabled &&
              ability.can(
                  'create',
                  subject('DataApp', {
                      organizationUuid: user.data?.organizationUuid,
                      projectUuid,
                  }),
              );
    if (!canCreate) return null;

    return (
        <Button
            size={size}
            mt={mt}
            component={Link}
            to={chartTypeBuilderPath(projectUrlIdentifier, null, owner)}
            leftSection={
                <MantineIcon icon={IconPlus} size={size === 'xs' ? 15 : 18} />
            }
        >
            New chart type
        </Button>
    );
};

export default NewChartTypeButton;
