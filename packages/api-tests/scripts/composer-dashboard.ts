// Creates or deletes a dashboard holding one composer chart tile, for proofs:
//   SITE_URL=... LDPAT=... pnpm -F api-tests composer-dashboard create
//   SITE_URL=... LDPAT=... pnpm -F api-tests composer-dashboard delete <dashboardUuid>
/* eslint-disable no-console */
import {
    createComposerDashboard,
    deleteComposerDashboard,
    fetchSend,
} from '../helpers/composerDashboard';

const { SITE_URL, LDPAT } = process.env;
if (!SITE_URL || !LDPAT) throw new Error('Set SITE_URL and LDPAT');
const send = fetchSend(SITE_URL.replace(/\/$/, ''), {
    Authorization: `ApiKey ${LDPAT}`,
});
const [command, dashboardUuid] = process.argv.slice(2);

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
    } else if (command === 'delete' && dashboardUuid) {
        await deleteComposerDashboard(send, dashboardUuid);
        console.log(`Deleted ${dashboardUuid}`);
    } else {
        throw new Error(
            'Usage: composer-dashboard create | delete <dashboardUuid>',
        );
    }
};

void run();
