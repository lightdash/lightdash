import { GoogleAuth } from 'google-auth-library';

export const runShopifyDataIngestion = async (
    shopUrl: string,
    tables?: string[],
): Promise<string> => {
    const projectId = process.env.GCP_PROJECT_ID || 'shopifyanalytics-448415';
    const region = process.env.CLOUD_RUN_REGION || 'us-central1';
    const jobName = process.env.CLOUD_RUN_JOB_NAME || 'shopify-ingestion';

    if (!projectId || !region || !jobName) {
        throw new Error('Missing required GCP environment variables');
    }

    const jobPath = `projects/${projectId}/locations/${region}/jobs/${jobName}`;
    const url = `https://${region}-run.googleapis.com/v2/${jobPath}:run`;

    const args = [`--shop_url=${shopUrl}`];
    if (tables?.length) args.push('--tables', ...tables);

    const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const accessTokenObj = await client.getAccessToken();
    const token = typeof accessTokenObj === 'string' ? accessTokenObj : accessTokenObj.token;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                overrides: {
                    containerOverrides: [{ args }],
                },
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('❌ Cloud Run API error:', response.status, errorBody);
            throw new Error(`Cloud Run API request failed with status ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Job started:', data.name);
        return data.name;
    } catch (err: any) {
        console.error('❌ Unexpected error:', err.message || err);
        throw err;
    }
};
