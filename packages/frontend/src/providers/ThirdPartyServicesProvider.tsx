import { PostHogProvider, usePostHog } from 'posthog-js/react';
import { useEffect, type FC } from 'react';
import { Helmet } from 'react-helmet';
import { IntercomProvider } from 'react-use-intercom';
import { Intercom } from '../components/Intercom';
import useSentry from '../hooks/thirdPartyServices/useSentry';
import { useApp } from './AppProvider';

const Pylon = () => {
    const appId = ''; // todo: replace with health.data.pylon.appId
    const { user } = useApp();
    useEffect(() => {
        if (user.data) {
            // @ts-ignore
            window.pylon = {
                chat_settings: {
                    app_id: appId,
                    email: user.data.email,
                    name: `${user.data.firstName} ${user.data.lastName}`,
                },
            };
            // @ts-ignore
            window.Pylon('setNewIssueCustomFields', {
                user_uuid: user.data.userUuid,
                org_uuid: user.data.organizationUuid,
                org_name: user.data.organizationName,
                user_role: user.data.role,
            });
        }
    }, [user]);

    return (
        <Helmet>
            <script type="text/javascript">
                {`(function(){var e=window;var t=document;var n=function(){n.e(arguments)};n.q=[];n.e=function(e){n.q.push(e)};e.Pylon=n;var r=function(){var e=t.createElement("script");e.setAttribute("type","text/javascript");e.setAttribute("async","true");e.setAttribute("src","https://widget.usepylon.com/widget/${appId}");var n=t.getElementsByTagName("script")[0];n.parentNode.insertBefore(e,n)};if(t.readyState==="complete"){r()}else if(e.addEventListener){e.addEventListener("load",r,false)}})();`}
            </script>
        </Helmet>
    );
};

const PosthogIdentified: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const { user } = useApp();
    const posthog = usePostHog();
    if (user.data) {
        posthog.identify(user.data.userUuid, {
            uuid: user.data.userUuid,
            ...(user.data.isTrackingAnonymized
                ? {}
                : {
                      email: user.data.email,
                      first_name: user.data.firstName,
                      last_name: user.data.lastName,
                  }),
        });
        if (user.data.organizationUuid) {
            posthog.group('organization', user.data.organizationUuid, {
                uuid: user.data.organizationUuid,
                name: user.data.organizationName,
            });
        }
    }
    return <>{children}</>;
};

const ThirdPartyServicesEnabledProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => {
    const { health, user } = useApp();

    useSentry(health?.data?.sentry, user.data);

    return (
        <IntercomProvider
            appId={health.data?.intercom.appId || ''}
            shouldInitialize={!!health.data?.intercom.appId}
            apiBase={health.data?.intercom.apiBase || ''}
            autoBoot
        >
            <PostHogProvider
                apiKey={health.data?.posthog.projectApiKey || ''}
                options={{
                    api_host: health.data?.posthog.apiHost,
                    autocapture: false,
                    capture_pageview: false,
                    bootstrap: {
                        featureFlags: {
                            'lazy-load-dashboard-tiles': true,
                        },
                    },
                }}
            >
                <PosthogIdentified>
                    <Intercom />
                    <Pylon />
                    {children}
                </PosthogIdentified>
            </PostHogProvider>
        </IntercomProvider>
    );
};

interface ThirdPartyServicesProviderProps {
    enabled?: boolean;
}

const ThirdPartyServicesProvider: FC<
    React.PropsWithChildren<ThirdPartyServicesProviderProps>
> = ({ children, enabled }) => {
    if (enabled) {
        return (
            <ThirdPartyServicesEnabledProvider>
                {children}
            </ThirdPartyServicesEnabledProvider>
        );
    } else {
        return <>{children}</>;
    }
};

export default ThirdPartyServicesProvider;
