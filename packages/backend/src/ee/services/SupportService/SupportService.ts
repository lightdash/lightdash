import {
    AnyType,
    LightdashPage,
    MissingConfigError,
    SessionUser,
} from '@lightdash/common';
import { KnownBlock } from '@slack/web-api';
import { IncomingHttpHeaders } from 'http';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { fromSession } from '../../../auth/account';
import { S3Client } from '../../../clients/Aws/S3Client';
import { LightdashConfig } from '../../../config/parseConfig';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { OrganizationModel } from '../../../models/OrganizationModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SpaceModel } from '../../../models/SpaceModel';
import { BaseService } from '../../../services/BaseService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { UnfurlService } from '../../../services/UnfurlService/UnfurlService';

type SupportServiceArguments = {
    dashboardModel: DashboardModel;
    savedChartModel: SavedChartModel;
    spaceModel: SpaceModel;
    projectModel: ProjectModel;
    s3Client: S3Client;
    organizationModel: OrganizationModel;
    unfurlService: UnfurlService;
    projectService: ProjectService;
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
};

export class SupportService extends BaseService {
    dashboardModel: DashboardModel;

    analytics: LightdashAnalytics;

    spaceModel: SpaceModel;

    projectModel: ProjectModel;

    s3Client: S3Client;

    organizationModel: OrganizationModel;

    savedChartModel: SavedChartModel;

    unfurlService: UnfurlService;

    projectService: ProjectService;

    lightdashConfig: LightdashConfig;

    constructor({
        dashboardModel,
        savedChartModel,
        spaceModel,
        s3Client,
        organizationModel,
        unfurlService,
        projectService,
        projectModel,
        analytics,
        lightdashConfig,
    }: SupportServiceArguments) {
        super();
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
        this.s3Client = s3Client;
        this.organizationModel = organizationModel;
        this.unfurlService = unfurlService;
        this.projectService = projectService;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.lightdashConfig = lightdashConfig;
    }

    private async uploadTextToS3(
        text: string[] | undefined,
        name: string,
    ): Promise<string> {
        try {
            if (text && text.length > 0) {
                const networkBuffer = Buffer.from(text.join('\n'), 'utf-8');
                return await this.s3Client.uploadTxt(
                    networkBuffer,
                    `support-${name}-${nanoid()}`,
                );
            }
        } catch (error) {
            console.error('Error uploading text to S3', error);
        }
        return `https://app.lightdash.cloud`; // We return a placeholder URL for slack to work
    }

    private async parseChart(
        user: SessionUser,
        projectUuid: string,
        chartUuid: string,
    ): Promise<KnownBlock> {
        const savedChart = await this.savedChartModel.get(chartUuid);

        const chartkBuffer = Buffer.from(
            JSON.stringify(savedChart.chartConfig, null, 2),
            'utf-8',
        );

        const chartconfigS3Url = await this.s3Client.uploadTxt(
            chartkBuffer,
            `support-chartconfig-${nanoid()}`,
        );

        const query = await this.projectService.compileQuery({
            account: fromSession(user),
            body: savedChart.metricQuery,
            projectUuid,
            exploreName: savedChart.tableName,
        });
        const queryBuffer = Buffer.from(query.query, 'utf-8');
        const sqlS3Url = await this.s3Client.uploadTxt(
            queryBuffer,
            `support-sql-${nanoid()}`,
        );
        return {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Chart uuid:* ${chartUuid}
*Chart name:* ${savedChart.name}
*Chart config:* <${chartconfigS3Url}|View chart config>
*SQL:* <${sqlS3Url}|View SQL>`.substring(0, 3000),
            },
        };
    }

    private static convertPropertiesToBlocks(
        properties: { key: string; value: string | undefined }[],
    ): KnownBlock[] {
        return properties.reduce<KnownBlock[]>((acc, entry) => {
            const { key, value } = entry;
            if (value) {
                acc.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*${key}:* ${value}`.substring(0, 3000),
                    },
                });
            }
            return acc;
        }, []);
    }

    async shareWithSupport(
        user: SessionUser,
        body: {
            image?: string | null;
            description?: string;
            canImpersonate: boolean;
            logs: AnyType[];
            network: AnyType[];
        },
        headers: IncomingHttpHeaders,
    ) {
        if (!this.lightdashConfig.slack?.supportUrl) {
            throw new MissingConfigError(
                'No support Slack URL found in config',
            );
        }

        let imageUrl: string | undefined;
        if (body.image) {
            const base64Data = body.image.replace(
                /^data:image\/\w+;base64,/,
                '',
            );
            const buffer = Buffer.from(base64Data, 'base64');
            imageUrl = await this.s3Client.uploadImage(
                buffer,
                `support-screenshot-${nanoid()}`,
            );
        }

        const logsS3Url = await this.uploadTextToS3(body.logs, 'logs');
        const networkS3Url = await this.uploadTextToS3(body.network, 'network');

        const organization = await this.organizationModel.get(
            user.organizationUuid!,
        );
        // Extract /project/<uuid> from referer
        const projectUuid = headers.referer
            ?.split('/projects/')[1]
            ?.split('/')[0];
        const project = projectUuid
            ? await this.projectModel.get(projectUuid)
            : undefined;

        const url = headers.referer;
        const parsedUrl = url
            ? await this.unfurlService.parseUrl(url)
            : undefined;

        const namespace = this.lightdashConfig.k8s.podNamespace || 'unknown';
        const now = new Date().toISOString();
        const googleLogsUrl = `https://console.cloud.google.com/logs/query;query=resource.labels.namespace_name%3D%22${namespace}%22%0Aresource.labels.container_name%3D%22lightdash%22%0A-jsonPayload.message%3D~%22%2Fapi%2Fv1%2Fhealth%22%0A-jsonPayload.message%3D~%22%2Fapi%2Fv1%2Flivez%22;endTime=${now}?project=lightdash-cloud-beta&authuser=0`;
        const analyticsUrl = `https://analytics.lightdash.cloud/projects/21eef0b9-5bae-40f3-851e-9554588e71a6/dashboards/c9364d94-1661-4623-be8b-2afcc8692f38?tempFilters=%7B%22dimensions%22%3A%5B%7B%22id%22%3A%22ac7cfa77-b208-4334-b3df-7e921f77cc53%22%2C%22operator%22%3A%22equals%22%2C%22target%22%3A%7B%22fieldId%22%3A%22projects_project_id%22%2C%22tableName%22%3A%22projects%22%2C%22fieldName%22%3A%22project_id%22%7D%2C%22tileTargets%22%3A%5B%5D%2C%22disabled%22%3Afalse%2C%22values%22%3A%5B%22${projectUuid}%22%5D%7D%5D%2C%22metrics%22%3A%5B%5D%2C%22tableCalculations%22%3A%5B%5D%7D`;
        const blocks = {
            channel: '#support-alerts',
            text: `New error report from: ${user?.firstName} ${user?.lastName} - ${organization.name}`,
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: `:loudspeaker: New error report from: ${user?.firstName} ${user?.lastName} - ${organization.name}`,
                        emoji: true,
                    },
                },
                {
                    type: 'divider',
                },
            ] as KnownBlock[],
        };

        const properties: { key: string; value: string | undefined }[] = [
            { key: 'Description', value: body.description },
            { key: 'User ID', value: user.userUuid },
            { key: 'Organization role', value: user.role },
            { key: 'Organization ID', value: organization.organizationUuid },
            {
                key: 'Lightdash version',
                value: `${headers['lightdash-version']}`,
            },
            {
                key: 'Sentry trace ID',
                value: `<https://lightdash.sentry.io/traces/trace/${headers['sentry-trace']}|View trace>`,
            },
            { key: 'User agent', value: headers['user-agent'] },
            {
                key: 'Project ID',
                value:
                    project?.projectUuid &&
                    `<${analyticsUrl}|${project?.projectUuid}>`,
            },
            { key: 'Project name', value: project?.name },
            { key: 'Host name', value: process.env.HOSTNAME }, // K8s pod name
            { key: 'Google logs', value: `<${googleLogsUrl}|View logs>` },
            { key: 'JS logs', value: `<${logsS3Url}|View logs>` },
            { key: 'Network logs', value: `<${networkS3Url}|View logs>` },
            { key: 'URL', value: `<${headers.referer}|${headers.origin}>` },
            {
                key: 'Can impersonate',
                value: body.canImpersonate
                    ? `:white_check_mark:`
                    : `:no_entry_sign:`,
            },
        ]; // Slack supports up to 50 blocks

        blocks.blocks.push(
            ...SupportService.convertPropertiesToBlocks(properties),
        );

        if (imageUrl) {
            blocks.blocks.push({
                type: 'image',
                title: {
                    type: 'plain_text',
                    text: 'Screenshot',
                },
                image_url: imageUrl,
                alt_text: 'screenshot',
            } as AnyType);
        }
        if (parsedUrl) {
            switch (parsedUrl.lightdashPage) {
                case LightdashPage.DASHBOARD:
                    blocks.blocks.push({
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*Dashboard uuid:* ${parsedUrl.dashboardUuid}`,
                        },
                    });
                    break;
                case LightdashPage.CHART:
                    if (parsedUrl.chartUuid && projectUuid) {
                        const chartBlock = await this.parseChart(
                            user,
                            projectUuid,
                            parsedUrl.chartUuid,
                        );
                        blocks.blocks.push(chartBlock);
                    }

                    break;
                default:
                    console.error(
                        'Unknown lightdash page',
                        parsedUrl?.lightdashPage,
                    );
            }
        }

        this.analytics.track({
            event: 'support.share',
            userId: user.userUuid,
            properties: {
                organizationId: organization.organizationUuid,
                projectId: project?.projectUuid,
                page: parsedUrl?.lightdashPage,
                withScreenshot: !!body.image,
                canImpersonate: body.canImpersonate,
            },
        });

        const slackResponse = await fetch(
            this.lightdashConfig.slack?.supportUrl,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(blocks),
            },
        );
        if (slackResponse.status !== 200) {
            console.error(
                'Error sending slack support message',
                await slackResponse.text(),
            );
        } else {
            console.info('Success sending slack support message');
        }
    }
}
