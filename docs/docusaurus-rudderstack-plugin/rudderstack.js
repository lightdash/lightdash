import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment'

export default (function() {
    if (!ExecutionEnvironment.canUseDOM) {
        return null;
    }

    return {
        onRouteUpdate({ location }) {
            if (!window.rudderanalytics) return;
            window.rudderanalytics.page()
        },
    }
})()
