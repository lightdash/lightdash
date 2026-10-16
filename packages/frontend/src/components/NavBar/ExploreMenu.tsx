import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Button, getDefaultZIndex, Menu } from '@mantine/core';
import {
    IconAppWindow,
    IconFileText,
    IconFolder,
    IconFolderPlus,
    IconLayoutDashboard,
    IconSquareRoundedPlus,
    IconTable,
    IconTerminal2,
} from '@tabler/icons-react';
import { memo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import DocumentCreateModal from '../../features/documents/DocumentCreateModal';
import { useContentAuthoringEnabled } from '../../hooks/useContentAuthoringEnabled';
import { useProject } from '../../hooks/useProject';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import useCreateInAnySpaceAccess from '../../hooks/user/useCreateInAnySpaceAccess';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { Can } from '../../providers/Ability';
import useApp from '../../providers/App/useApp';
import LargeMenuItem from '../common/LargeMenuItem';
import MantineIcon from '../common/MantineIcon';
import DashboardCreateModal from '../common/modal/DashboardCreateModal';
import SpaceActionModal from '../common/SpaceActionModal';
import { ActionType } from '../common/SpaceActionModal/types';
import AppColorSchemeScope from './AppColorSchemeScope';
import { useNavBarMenuProps } from './NavBarPortalContext';

type Props = {
    projectUuid: string;
    projectUrlIdentifier?: string;
};

const ExploreMenu: FC<Props> = memo((props) => {
    const { t } = useTranslation('navigation');
    const menuProps = useNavBarMenuProps();
    const { projectUuid, projectUrlIdentifier: projectUrlIdentifierProp } =
        props;
    const projectRoute = useOptionalProjectRoute();
    const { data: project } = useProject(projectUuid);
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ??
        projectUrlIdentifierProp ??
        projectUuid;
    const navigate = useNavigate();
    const location = useLocation();
    const contentAuthoringEnabled = useContentAuthoringEnabled();

    const { user } = useApp();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const documentsFlag = useServerFeatureFlag(FeatureFlags.Documents);

    const [isOpen, setIsOpen] = useState(false);
    const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState(false);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] = useState(false);
    const [isCreateDocumentOpen, setIsCreateDocumentOpen] = useState(false);
    const userCanCreateDashboards = useCreateInAnySpaceAccess(
        projectUuid,
        'Dashboard',
        { enabled: isOpen },
    );
    const userCanCreateDocuments = useCreateInAnySpaceAccess(
        projectUuid,
        'Document',
        { enabled: isOpen },
    );

    return (
        <>
            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                })}
            >
                <Menu
                    position="bottom-start"
                    arrowOffset={16}
                    offset={-2}
                    opened={isOpen}
                    onChange={setIsOpen}
                    zIndex={getDefaultZIndex('max')}
                    {...menuProps}
                >
                    <Menu.Target>
                        <Button
                            aria-label={t('new.label')}
                            variant="default"
                            size="xs"
                            fz="sm"
                            leftSection={
                                <MantineIcon
                                    color="dimmed"
                                    icon={IconSquareRoundedPlus}
                                />
                            }
                            data-testid="ExploreMenu/NewButton"
                            // Navigation anchor for scope walkthroughs
                            data-tour-nav="new"
                            data-tour-hint="Click New"
                        >
                            {t('new.label')}
                        </Button>
                    </Menu.Target>

                    <Menu.Dropdown>
                        {contentAuthoringEnabled && (
                            <LargeMenuItem
                                component={Link}
                                title={t('new.chart.title')}
                                description={t('new.chart.description')}
                                to={`/projects/${projectUrlIdentifier}/tables`}
                                icon={IconTable}
                                data-tour-nav="new-chart"
                                data-tour-hint="Choose Chart"
                            />
                        )}

                        {contentAuthoringEnabled &&
                            project?.provisioningSource !== 'analytics' && (
                                <Can
                                    I="manage"
                                    this={subject('SqlRunner', {
                                        organizationUuid:
                                            user.data?.organizationUuid,
                                        projectUuid,
                                    })}
                                >
                                    <LargeMenuItem
                                        component={Link}
                                        title={t('new.sqlRunner.title')}
                                        description={t(
                                            'new.sqlRunner.description',
                                        )}
                                        to={`/projects/${projectUrlIdentifier}/sql-runner`}
                                        data-tour-nav="new-sql-runner"
                                        data-tour-hint="Choose Query using SQL runner"
                                        onClick={(
                                            event: React.MouseEvent<HTMLAnchorElement>,
                                        ) => {
                                            if (
                                                location.pathname.startsWith(
                                                    `/projects/${projectUrlIdentifier}/sql-runner`,
                                                )
                                            ) {
                                                event.preventDefault();
                                                window.open(
                                                    `/projects/${projectUrlIdentifier}/sql-runner`,
                                                    '_blank',
                                                );
                                            }
                                        }}
                                        icon={IconTerminal2}
                                    />
                                </Can>
                            )}
                        {contentAuthoringEnabled && userCanCreateDashboards && (
                            <LargeMenuItem
                                title={t('new.dashboard.title')}
                                description={t('new.dashboard.description')}
                                onClick={() => setIsCreateDashboardOpen(true)}
                                icon={IconLayoutDashboard}
                                data-testid="ExploreMenu/NewDashboardButton"
                                data-tour-nav="new-dashboard"
                                data-tour-hint="Choose Dashboard"
                            />
                        )}

                        {contentAuthoringEnabled &&
                            documentsFlag.data?.enabled &&
                            userCanCreateDocuments && (
                                <LargeMenuItem
                                    title={t('new.document.title')}
                                    description={t('new.document.description')}
                                    onClick={() =>
                                        setIsCreateDocumentOpen(true)
                                    }
                                    icon={IconFileText}
                                    data-testid="ExploreMenu/NewDocumentButton"
                                    // Navigation anchor for scope walkthroughs (data-tour-via)
                                    data-tour-nav="new-document"
                                    data-tour-hint="Choose Document"
                                />
                            )}

                        {dataAppsFlag.data?.enabled && (
                            <Can
                                I="create"
                                this={subject('DataApp', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <LargeMenuItem
                                    component={Link}
                                    // Navigation anchor for scope walkthroughs (data-tour-via)
                                    data-tour-nav="new-app"
                                    data-tour-hint="Choose Data App"
                                    title={t('new.dataApp.title')}
                                    description={t('new.dataApp.description')}
                                    to={`/projects/${projectUuid}/apps/generate`}
                                    icon={IconAppWindow}
                                    isBeta
                                />
                            </Can>
                        )}

                        <Can
                            I="create"
                            this={subject('Space', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <LargeMenuItem
                                title={t('new.space.title')}
                                description={t('new.space.description')}
                                onClick={() => setIsCreateSpaceOpen(true)}
                                icon={IconFolder}
                            />
                        </Can>
                    </Menu.Dropdown>
                </Menu>
            </Can>

            {isCreateSpaceOpen && (
                <AppColorSchemeScope>
                    <SpaceActionModal
                        projectUuid={projectUuid}
                        actionType={ActionType.CREATE}
                        title={t('new.createSpace')}
                        confirmButtonLabel={t('actions.create', {
                            ns: 'common',
                        })}
                        icon={IconFolderPlus}
                        onClose={() => setIsCreateSpaceOpen(false)}
                        onSubmitForm={(space) => {
                            if (space)
                                void navigate(
                                    `/projects/${projectUrlIdentifier}/spaces/${space.uuid}`,
                                );
                        }}
                        parentSpaceUuid={null}
                    />
                </AppColorSchemeScope>
            )}
            {isCreateDocumentOpen && (
                <AppColorSchemeScope>
                    <DocumentCreateModal
                        projectUuid={projectUuid}
                        defaultSpaceUuid={null}
                        onClose={() => setIsCreateDocumentOpen(false)}
                    />
                </AppColorSchemeScope>
            )}
            {isCreateDashboardOpen && (
                <AppColorSchemeScope>
                    <DashboardCreateModal
                        projectUuid={projectUuid}
                        opened={isCreateDashboardOpen}
                        onClose={() => setIsCreateDashboardOpen(false)}
                        onConfirm={(dashboard) => {
                            void navigate(
                                `/projects/${projectUrlIdentifier}/dashboards/${dashboard.slug}/edit`,
                            );

                            setIsCreateDashboardOpen(false);
                        }}
                    />
                </AppColorSchemeScope>
            )}
        </>
    );
});
export default ExploreMenu;
