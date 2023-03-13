import { Colors } from '@blueprintjs/core';
import { Ability } from '@casl/ability';
import { Helmet } from 'react-helmet';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ReactQueryDevtools } from 'react-query/devtools';
import {
    BrowserRouter as Router,
    Redirect,
    Route,
    Switch,
} from 'react-router-dom';
import AppRoute from './components/AppRoute';
import { AbilityContext } from './components/common/Authorization';
import ForbiddenPanel from './components/ForbiddenPanel';
import JobDetailsDrawer from './components/JobDetailsDrawer';
import MobileView from './components/Mobile';
import NavBar from './components/NavBar';
import PrivateRoute from './components/PrivateRoute';
import ProjectRoute from './components/ProjectRoute';
import UserCompletionModal from './components/UserCompletionModal';
import CreateProject from './pages/CreateProject';
import CreateProjectSettings from './pages/CreateProjectSettings';
import Dashboard from './pages/Dashboard';
import Explorer from './pages/Explorer';
import Home from './pages/Home';
import { JoinOrganizationPage } from './pages/JoinOrganization';
import Login from './pages/Login';
import MinimalDashboard from './pages/MinimalDashboard';
import MinimalSavedExplorer from './pages/MinimalSavedExplorer';
import PasswordRecovery from './pages/PasswordRecovery';
import PasswordReset from './pages/PasswordReset';
import { Projects } from './pages/Projects';
import Register from './pages/Register';
import SavedDashboards from './pages/SavedDashboards';
import SavedExplorer from './pages/SavedExplorer';
import SavedQueries from './pages/SavedQueries';
import Settings from './pages/Settings';
import ShareRedirect from './pages/ShareRedirect';
import Signup from './pages/Signup';
import Space from './pages/Space';
import Spaces from './pages/Spaces';
import SqlRunner from './pages/SqlRunner';
import UserActivity from './pages/UserActivity';
import { VerifyEmailPage } from './pages/VerifyEmail';
import { ActiveJobProvider } from './providers/ActiveJobProvider';
import { AppProvider } from './providers/AppProvider';
import { BlueprintProvider } from './providers/BlueprintProvider';
import { DashboardProvider } from './providers/DashboardProvider';
import { ErrorLogsProvider } from './providers/ErrorLogsProvider';
import MantineProvider from './providers/MantineProvider';
import ThirdPartyProvider from './providers/ThirdPartyServicesProvider';
import { TrackingProvider, TrackPage } from './providers/TrackingProvider';
import { PageName } from './types/Events';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            onError: async (result) => {
                // @ts-ignore
                const { error: { statusCode } = {} } = result;
                if (statusCode === 401) {
                    await queryClient.invalidateQueries('health');
                }
            },
        },
    },
});

const defaultAbility = new Ability();

const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
    ) || window.innerWidth < 768;

const isMinimalPage = window.location.pathname.startsWith('/minimal');

const App = () => (
    <>
        <Helmet>
            <title>Lightdash</title>
        </Helmet>

        <QueryClientProvider client={queryClient}>
            <MantineProvider>
                <BlueprintProvider>
                    <AppProvider>
                        <Router>
                            <ThirdPartyProvider enabled={!isMinimalPage}>
                                <TrackingProvider enabled={!isMinimalPage}>
                                    <AbilityContext.Provider
                                        value={defaultAbility}
                                    >
                                        <ActiveJobProvider>
                                            <ErrorLogsProvider>
                                                {isMobile ? (
                                                    <MobileView />
                                                ) : (
                                                    <Switch>
                                                        <PrivateRoute path="/minimal">
                                                            <Switch>
                                                                <Route path="/minimal/projects/:projectUuid/saved/:savedQueryUuid">
                                                                    <div
                                                                        style={{
                                                                            height: '100vh',
                                                                        }}
                                                                    >
                                                                        <MinimalSavedExplorer />
                                                                    </div>
                                                                </Route>

                                                                <Route path="/minimal/projects/:projectUuid/dashboards/:dashboardUuid">
                                                                    <MinimalDashboard />
                                                                </Route>
                                                            </Switch>
                                                        </PrivateRoute>

                                                        <Route path="/register">
                                                            <TrackPage
                                                                name={
                                                                    PageName.REGISTER
                                                                }
                                                            >
                                                                <Register />
                                                            </TrackPage>
                                                        </Route>

                                                        <Route path="/login">
                                                            <TrackPage
                                                                name={
                                                                    PageName.LOGIN
                                                                }
                                                            >
                                                                <Login />
                                                            </TrackPage>
                                                        </Route>

                                                        <Route path="/recover-password">
                                                            <TrackPage
                                                                name={
                                                                    PageName.PASSWORD_RECOVERY
                                                                }
                                                            >
                                                                <PasswordRecovery />
                                                            </TrackPage>
                                                        </Route>

                                                        <Route path="/reset-password/:code">
                                                            <TrackPage
                                                                name={
                                                                    PageName.PASSWORD_RESET
                                                                }
                                                            >
                                                                <PasswordReset />
                                                            </TrackPage>
                                                        </Route>

                                                        <Route path="/invite/:inviteCode">
                                                            <TrackPage
                                                                name={
                                                                    PageName.SIGNUP
                                                                }
                                                            >
                                                                <Signup />
                                                            </TrackPage>
                                                        </Route>
                                                        <Route path="/verify-email">
                                                            <TrackPage
                                                                name={
                                                                    PageName.VERIFY_EMAIL
                                                                }
                                                            >
                                                                <VerifyEmailPage />
                                                            </TrackPage>
                                                        </Route>

                                                        <Route path="/join-organization">
                                                            <TrackPage
                                                                name={
                                                                    PageName.JOIN_ORGANIZATION
                                                                }
                                                            >
                                                                <JoinOrganizationPage />
                                                            </TrackPage>
                                                        </Route>

                                                        <PrivateRoute path="/">
                                                            <div
                                                                style={{
                                                                    minHeight:
                                                                        '100vh',
                                                                    background:
                                                                        Colors.LIGHT_GRAY5,
                                                                }}
                                                            >
                                                                <UserCompletionModal />
                                                                <JobDetailsDrawer />

                                                                <Switch>
                                                                    <Route path="/createProject/:method?">
                                                                        <NavBar />
                                                                        <TrackPage
                                                                            name={
                                                                                PageName.CREATE_PROJECT
                                                                            }
                                                                        >
                                                                            <CreateProject />
                                                                        </TrackPage>
                                                                    </Route>
                                                                    <Route path="/createProjectSettings/:projectUuid">
                                                                        <NavBar />
                                                                        <TrackPage
                                                                            name={
                                                                                PageName.CREATE_PROJECT_SETTINGS
                                                                            }
                                                                        >
                                                                            <CreateProjectSettings />
                                                                        </TrackPage>
                                                                    </Route>
                                                                    <Route path="/generalSettings/:tab?">
                                                                        <NavBar />
                                                                        <TrackPage
                                                                            name={
                                                                                PageName.GENERAL_SETTINGS
                                                                            }
                                                                        >
                                                                            <Settings />
                                                                        </TrackPage>
                                                                    </Route>
                                                                    <Route path="/no-access">
                                                                        <NavBar />
                                                                        <TrackPage
                                                                            name={
                                                                                PageName.NO_ACCESS
                                                                            }
                                                                        >
                                                                            <ForbiddenPanel />
                                                                        </TrackPage>
                                                                    </Route>
                                                                    <Route path="/no-project-access">
                                                                        <NavBar />
                                                                        <TrackPage
                                                                            name={
                                                                                PageName.NO_PROJECT_ACCESS
                                                                            }
                                                                        >
                                                                            <ForbiddenPanel subject="project" />
                                                                        </TrackPage>
                                                                    </Route>
                                                                    <Route path="/share/:shareNanoid">
                                                                        <NavBar />
                                                                        <TrackPage
                                                                            name={
                                                                                PageName.SHARE
                                                                            }
                                                                        >
                                                                            <ShareRedirect />
                                                                        </TrackPage>
                                                                    </Route>

                                                                    <AppRoute path="/">
                                                                        <Switch>
                                                                            <ProjectRoute path="/projects/:projectUuid">
                                                                                <Switch>
                                                                                    <Route path="/projects/:projectUuid/saved/:savedQueryUuid/:mode?">
                                                                                        <NavBar />
                                                                                        <TrackPage
                                                                                            name={
                                                                                                PageName.SAVED_QUERY_EXPLORER
                                                                                            }
                                                                                        >
                                                                                            <SavedExplorer />
                                                                                        </TrackPage>
                                                                                    </Route>

                                                                                    <Route path="/projects/:projectUuid/saved">
                                                                                        <NavBar />
                                                                                        <TrackPage
                                                                                            name={
                                                                                                PageName.SAVED_QUERIES
                                                                                            }
                                                                                        >
                                                                                            <SavedQueries />
                                                                                        </TrackPage>
                                                                                    </Route>

                                                                                    <Route path="/projects/:projectUuid/dashboards/:dashboardUuid/:mode?">
                                                                                        <NavBar />
                                                                                        <TrackPage
                                                                                            name={
                                                                                                PageName.DASHBOARD
                                                                                            }
                                                                                        >
                                                                                            <DashboardProvider>
                                                                                                <Dashboard />
                                                                                            </DashboardProvider>
                                                                                        </TrackPage>
                                                                                    </Route>

                                                                                    <Route path="/projects/:projectUuid/dashboards">
                                                                                        <NavBar />
                                                                                        <TrackPage
                                                                                            name={
                                                                                                PageName.SAVED_DASHBOARDS
                                                                                            }
                                                                                        >
                                                                                            <SavedDashboards />
                                                                                        </TrackPage>
                                                                                    </Route>

                                                                                    <Route path="/projects/:projectUuid/sqlRunner">
                                                                                        <NavBar />
                                                                                        <TrackPage
                                                                                            name={
                                                                                                PageName.SQL_RUNNER
                                                                                            }
                                                                                        >
                                                                                            <SqlRunner />
                                                                                        </TrackPage>
                                                                                    </Route>

                                                                                    <Route path="/projects/:projectUuid/tables/:tableId">
                                                                                        <NavBar />
                                                                                        <TrackPage
                                                                                            name={
                                                                                                PageName.EXPLORER
                                                                                            }
                                                                                        >
                                                                                            <Explorer />
                                                                                        </TrackPage>
                                                                                    </Route>

                                                                                    <Route path="/projects/:projectUuid/tables">
                                                                                        <NavBar />
                                                                                        <TrackPage
                                                                                            name={
                                                                                                PageName.EXPLORE_TABLES
                                                                                            }
                                                                                        >
                                                                                            <Explorer />
                                                                                        </TrackPage>
                                                                                    </Route>

                                                                                    <Route path="/projects/:projectUuid/spaces/:spaceUuid">
                                                                                        <NavBar />
                                                                                        <TrackPage
                                                                                            name={
                                                                                                PageName.SPACE
                                                                                            }
                                                                                        >
                                                                                            <Space />
                                                                                        </TrackPage>
                                                                                    </Route>

                                                                                    <Route path="/projects/:projectUuid/spaces">
                                                                                        <NavBar />
                                                                                        <TrackPage
                                                                                            name={
                                                                                                PageName.SPACES
                                                                                            }
                                                                                        >
                                                                                            <Spaces />
                                                                                        </TrackPage>
                                                                                    </Route>

                                                                                    <Route
                                                                                        path="/projects/:projectUuid/home"
                                                                                        exact
                                                                                    >
                                                                                        <NavBar />
                                                                                        <TrackPage
                                                                                            name={
                                                                                                PageName.HOME
                                                                                            }
                                                                                        >
                                                                                            <Home />
                                                                                        </TrackPage>
                                                                                    </Route>

                                                                                    <Route
                                                                                        path="/projects/:projectUuid/user-activity"
                                                                                        exact
                                                                                    >
                                                                                        <NavBar />
                                                                                        <TrackPage
                                                                                            name={
                                                                                                PageName.USER_ACTIVITY
                                                                                            }
                                                                                        >
                                                                                            <UserActivity />
                                                                                        </TrackPage>
                                                                                    </Route>

                                                                                    <Redirect to="/projects" />
                                                                                </Switch>
                                                                            </ProjectRoute>

                                                                            <Route
                                                                                path="/projects/:projectUuid?"
                                                                                exact
                                                                            >
                                                                                <Projects />
                                                                            </Route>

                                                                            <Redirect to="/projects" />
                                                                        </Switch>
                                                                    </AppRoute>
                                                                </Switch>
                                                            </div>
                                                        </PrivateRoute>
                                                    </Switch>
                                                )}
                                            </ErrorLogsProvider>
                                        </ActiveJobProvider>
                                    </AbilityContext.Provider>
                                </TrackingProvider>
                            </ThirdPartyProvider>
                        </Router>
                    </AppProvider>
                </BlueprintProvider>
            </MantineProvider>

            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    </>
);

export default App;
