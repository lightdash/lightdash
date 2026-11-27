// Usage: SITE_URL=... LDPAT=... pnpm -F api-tests composer-dashboard create | delete <dashboardUuid> | create-space | delete-space <spaceUuid>
/* eslint-disable no-console */
import {
    createComposerDashboard,
    createComposerSpaceChart,
    deleteComposerDashboard,
    deleteComposerSpace,
    fetchSend,
} from '../helpers/composerDashboard';

const { SITE_URL, LDPAT } = process.env;
if (!SITE_URL || !LDPAT) throw new Error('Set SITE_URL and LDPAT');
const send = fetchSend(SITE_URL.replace(/\/$/, ''), {
    Authorization: `ApiKey ${LDPAT}`,
});
const [command, uuid] = process.argv.slice(2);

const run = async () => {
    if (command === 'create') {
        const { dashboard, chart } = await createComposerDashboard(send);
        console.log(
            JSON.stringify({
                dashboardUuid: dashboard.uuid,
                composerChartUuid: chart.uuid,
                url: `${SITE_URL}/projects/${dashboard.projectUuid}/dashboards/${dashboard.uuid}/view`,
            }),
        );
    } else if (command === 'delete' && uuid) {
        await deleteComposerDashboard(send, uuid);
        console.log(`Deleted ${uuid}`);
    } else if (command === 'create-space') {
        const { space, chart } = await createComposerSpaceChart(send);
        console.log(
            JSON.stringify({
                spaceUuid: space.uuid,
                composerChartUuid: chart.uuid,
                apiUrl: `${SITE_URL}/api/v2/projects/${chart.projectUuid}/composer-charts/${chart.uuid}`,
            }),
        );
    } else if (command === 'delete-space' && uuid) {
        await deleteComposerSpace(send, uuid);
        console.log(`Deleted ${uuid}`);
    } else {
        throw new Error(
            'Usage: composer-dashboard create | delete <dashboardUuid> | create-space | delete-space <spaceUuid>',
        );
    }
};

run().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
});
