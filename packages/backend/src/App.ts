// organize-imports-ignore
// eslint-disable-next-line import/order
import './sentry'; // Sentry has to be initialized before anything else

import {
    LightdashError,
    LightdashMode,
    SessionUser,
    UnexpectedServerError,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import flash from 'connect-flash';
import connectSessionKnex from 'connect-session-knex';
import express, { Express, NextFunction, Request, Response } from 'express';
import expressSession from 'express-session';
import expressStaticGzip from 'express-static-gzip';
import helmet from 'helmet';
import knex, { Knex } from 'knex';
import passport from 'passport';
import refresh from 'passport-oauth2-refresh';
import path from 'path';
import reDoc from 'redoc-express';
import { URL } from 'url';
import { LightdashAnalytics } from './analytics/LightdashAnalytics';
import {
    ClientProviderMap,
    ClientRepository,
} from './clients/ClientRepository';
import { SlackBot } from './clients/Slack/Slackbot';
import { LightdashConfig } from './config/parseConfig';
import {
    apiKeyPassportStrategy,
    createAzureAdPassportStrategy,
    createGenericOidcPassportStrategy,
    googlePassportStrategy,
    isAzureAdPassportStrategyAvailableToUse,
    isGenericOidcPassportStrategyAvailableToUse,
    isOktaPassportStrategyAvailableToUse,
    localPassportStrategy,
    oneLoginPassportStrategy,
    OpenIDClientOktaStrategy,
} from './controllers/authentication';
import { errorHandler } from './errors';
import { RegisterRoutes } from './generated/routes';
import apiSpec from './generated/swagger.json';
import Logger from './logging/logger';
import {
    expressWinstonMiddleware,
    expressWinstonPreResponseMiddleware,
} from './logging/winston';
import { ModelProviderMap, ModelRepository } from './models/ModelRepository';
import { postHogClient } from './postHog';
import { apiV1Router } from './routers/apiV1Router';
import { SchedulerWorker } from './scheduler/SchedulerWorker';
import {
    OperationContext,
    ServiceProviderMap,
    ServiceRepository,
} from './services/ServiceRepository';
import { UtilProviderMap, UtilRepository } from './utils/UtilRepository';
import { VERSION } from './version';
import PrometheusMetrics from './prometheus';

// We need to override this interface to have our user typing
declare global {
    namespace Express {
        /**
         * There's potentially a good case for NOT including this under the top-level of the Request,
         * but instead under `locals` - I've yet to see a good reasoning on -why-, so for now I'm
         * opting for the keystrokes saved through omitting `.locals`.
         */
        interface Request {
            services: ServiceRepository;
            /**
             * @deprecated Clients should be used inside services. This will be removed soon.
             */
            clients: ClientRepository;
        }

        interface User extends SessionUser {}
    }
}

const schedulerWorkerFactory = (context: {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    serviceRepository: ServiceRepository;
    models: ModelRepository;
    clients: ClientRepository;
    utils: UtilRepository;
}) =>
    new SchedulerWorker({
        lightdashConfig: context.lightdashConfig,
        analytics: context.analytics,
        unfurlService: context.serviceRepository.getUnfurlService(),
        csvService: context.serviceRepository.getCsvService(),
        dashboardService: context.serviceRepository.getDashboardService(),
        projectService: context.serviceRepository.getProjectService(),
        schedulerService: context.serviceRepository.getSchedulerService(),
        validationService: context.serviceRepository.getValidationService(),
        userService: context.serviceRepository.getUserService(),
        emailClient: context.clients.getEmailClient(),
        googleDriveClient: context.clients.getGoogleDriveClient(),
        s3Client: context.clients.getS3Client(),
        schedulerClient: context.clients.getSchedulerClient(),
        slackClient: context.clients.getSlackClient(),
        semanticLayerService:
            context.serviceRepository.getSemanticLayerService(),
        catalogService: context.serviceRepository.getCatalogService(),
    });

const slackBotFactory = (context: {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    serviceRepository: ServiceRepository;
    models: ModelRepository;
}) =>
    new SlackBot({
        lightdashConfig: context.lightdashConfig,
        analytics: context.analytics,
        slackAuthenticationModel: context.models.getSlackAuthenticationModel(),
        unfurlService: context.serviceRepository.getUnfurlService(),
    });

type AppArguments = {
    lightdashConfig: LightdashConfig;
    port: string | number;
    environment?: 'production' | 'development';
    serviceProviders?: ServiceProviderMap;
    knexConfig: {
        production: Knex.Config<Knex.PgConnectionConfig>;
        development: Knex.Config<Knex.PgConnectionConfig>;
    };
    clientProviders?: ClientProviderMap;
    modelProviders?: ModelProviderMap;
    utilProviders?: UtilProviderMap;
    slackBotFactory?: typeof slackBotFactory;
    schedulerWorkerFactory?: typeof schedulerWorkerFactory;
    customExpressMiddlewares?: Array<(app: Express) => void>; // Array of custom middleware functions
};

export default class App {
    private readonly serviceRepository: ServiceRepository;

    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly port: string | number;

    private readonly environment: 'production' | 'development';

    private schedulerWorker: SchedulerWorker | undefined;

    private readonly clients: ClientRepository;

    private readonly utils: UtilRepository;

    private readonly models: ModelRepository;

    private readonly database: Knex;

    private readonly slackBotFactory: typeof slackBotFactory;

    private readonly schedulerWorkerFactory: typeof schedulerWorkerFactory;

    private readonly prometheusMetrics: PrometheusMetrics;

    private readonly customExpressMiddlewares: Array<(app: Express) => void>;

    constructor(args: AppArguments) {
        this.lightdashConfig = args.lightdashConfig;
        this.port = args.port;
        this.environment = args.environment || 'production';
        this.analytics = new LightdashAnalytics({
            lightdashConfig: this.lightdashConfig,
            writeKey: this.lightdashConfig.rudder.writeKey || 'notrack',
            dataPlaneUrl: this.lightdashConfig.rudder.dataPlaneUrl
                ? `${this.lightdashConfig.rudder.dataPlaneUrl}/v1/batch`
                : 'notrack',
            options: {
                enable:
                    this.lightdashConfig.rudder.writeKey &&
                    this.lightdashConfig.rudder.dataPlaneUrl,
            },
        });
        this.database = knex(
            this.environment === 'production'
                ? args.knexConfig.production
                : args.knexConfig.development,
        );
        this.utils = new UtilRepository({
            utilProviders: args.utilProviders,
            lightdashConfig: this.lightdashConfig,
        });
        this.models = new ModelRepository({
            modelProviders: args.modelProviders,
            lightdashConfig: this.lightdashConfig,
            database: this.database,
            utils: this.utils,
        });
        this.clients = new ClientRepository({
            clientProviders: args.clientProviders,
            context: new OperationContext({
                operationId: 'App#ctor',
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
            }),
            models: this.models,
        });
        this.serviceRepository = new ServiceRepository({
            serviceProviders: args.serviceProviders,
            context: new OperationContext({
                operationId: 'App#ctor',
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
            }),
            clients: this.clients,
            models: this.models,
        });
        this.slackBotFactory = args.slackBotFactory || slackBotFactory;
        this.schedulerWorkerFactory =
            args.schedulerWorkerFactory || schedulerWorkerFactory;
        this.prometheusMetrics = new PrometheusMetrics(
            this.lightdashConfig.prometheus,
        );
        this.customExpressMiddlewares = args.customExpressMiddlewares || [];
    }

    async start() {
        this.prometheusMetrics.start();
        // @ts-ignore
        // eslint-disable-next-line no-extend-native, func-names
        BigInt.prototype.toJSON = function () {
            return this.toString();
        };

        const expressApp = express();

        // Slack must be initialized before our own middleware / routes, which cause the slack app to fail
        this.initSlack(expressApp).catch((e) => {
            Logger.error('Error starting slack bot', e);
        });

        Sentry.setTags({
            k8s_pod_name: this.lightdashConfig.k8s.podName,
            k8s_pod_namespace: this.lightdashConfig.k8s.podNamespace,
            k8s_node_name: this.lightdashConfig.k8s.nodeName,
            lightdash_cloud_instance:
                this.lightdashConfig.lightdashCloudInstance,
        });

        // Load Lightdash middleware/routes last
        await this.initExpress(expressApp);

        if (this.lightdashConfig.scheduler?.enabled) {
            this.initSchedulerWorker();
            this.prometheusMetrics.monitorQueues(
                this.clients.getSchedulerClient(),
            );
        }
    }

    private async initExpress(expressApp: Express) {
        const KnexSessionStore = connectSessionKnex(expressSession);

        const store = new KnexSessionStore({
            knex: this.database as any,
            createtable: false,
            tablename: 'sessions',
            sidfieldname: 'sid',
        });

        // Use custom middlewares if provided
        this.customExpressMiddlewares.forEach((middleware) =>
            middleware(expressApp),
        );

        expressApp.use(
            express.json({ limit: this.lightdashConfig.maxPayloadSize }),
        );

        const reportUris: URL[] = [];
        try {
            if (this.lightdashConfig.sentry.backend.securityReportUri) {
                const sentryReportUri = new URL(
                    this.lightdashConfig.sentry.backend.securityReportUri,
                );
                sentryReportUri.searchParams.set(
                    'sentry_environment',
                    this.environment === 'development'
                        ? 'development'
                        : this.lightdashConfig.mode,
                );
                sentryReportUri.searchParams.set('sentry_release', VERSION);
                reportUris.push(sentryReportUri);
            }
            if (this.lightdashConfig.security.contentSecurityPolicy.reportUri) {
                reportUris.push(
                    new URL(
                        this.lightdashConfig.security.contentSecurityPolicy.reportUri,
                    ),
                );
            }
        } catch (e) {
            Logger.warn('Invalid security report URI', e);
        }

        const contentSecurityPolicyAllowedDomains: string[] = [
            'https://*.sentry.io',
            'https://analytics.lightdash.com',
            'https://*.usepylon.com',
            'https://*.pusher.com', // used by pylon
            'wss://*.pusher.com', // used by pylon
            'https://*.headwayapp.co',
            'https://headway-widget.net',
            'https://*.posthog.com',
            'https://*.intercom.com',
            'https://*.intercom.io',
            'wss://*.intercom.io',
            'https://*.intercomcdn.com',
            'https://*.rudderlabs.com',
            'https://www.googleapis.com',
            'https://apis.google.com',
            'https://accounts.google.com',
            'https://vega.github.io',
            'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/',
            'https://*.lightdash.cloud',
            ...this.lightdashConfig.security.contentSecurityPolicy
                .allowedDomains,
        ];

        expressApp.use(
            helmet({
                contentSecurityPolicy: {
                    directives: {
                        'default-src': [
                            "'self'",
                            ...contentSecurityPolicyAllowedDomains,
                        ],
                        'img-src': ["'self'", 'data:', 'https://*'],
                        'frame-src': ["'self'", 'https://*'],
                        'frame-ancestors': ["'self'", 'https://*'],
                        'worker-src': [
                            "'self'",
                            'blob:',
                            ...contentSecurityPolicyAllowedDomains,
                        ],
                        'child-src': [
                            // Fallback of worker-src for safari older than 15.5
                            "'self'",
                            'blob:',
                            ...contentSecurityPolicyAllowedDomains,
                        ],
                        'script-src': [
                            "'self'",
                            "'unsafe-eval'",
                            ...contentSecurityPolicyAllowedDomains,
                        ],
                        'script-src-elem': [
                            "'self'",
                            "'unsafe-inline'",
                            ...contentSecurityPolicyAllowedDomains,
                        ],
                        'report-uri': reportUris.map((uri) => uri.href),
                    },
                    reportOnly:
                        this.lightdashConfig.security.contentSecurityPolicy
                            .reportOnly,
                },
                strictTransportSecurity: {
                    maxAge: 31536000,
                    includeSubDomains: true,
                    preload: true,
                },
                referrerPolicy: {
                    policy: 'strict-origin-when-cross-origin',
                },
                noSniff: true,
                xFrameOptions: false,
                crossOriginOpenerPolicy: {
                    policy: [LightdashMode.DEMO, LightdashMode.PR].includes(
                        this.lightdashConfig.mode,
                    )
                        ? 'unsafe-none'
                        : 'same-origin',
                },
            }),
        );

        // Permissions-Policy header that is not yet supported by helmet. More details here: https://github.com/helmetjs/helmet/issues/234
        expressApp.use((req, res, next) => {
            res.setHeader('Permissions-Policy', 'camera=(), microphone=()');
            next();
        });

        expressApp.use(express.json());
        expressApp.use(express.urlencoded({ extended: false }));

        expressApp.use(
            expressSession({
                secret: this.lightdashConfig.lightdashSecret,
                proxy: this.lightdashConfig.trustProxy,
                rolling: true,
                cookie: {
                    maxAge:
                        (this.lightdashConfig.cookiesMaxAgeHours || 24) *
                        60 *
                        60 *
                        1000, // in ms
                    secure: this.lightdashConfig.secureCookies,
                    httpOnly: true,
                    sameSite: 'lax',
                },
                resave: false,
                saveUninitialized: false,
                store,
            }),
        );
        expressApp.use(flash());
        expressApp.use(passport.initialize());
        expressApp.use(passport.session());

        expressApp.use(expressWinstonPreResponseMiddleware); // log request before response is sent
        expressApp.use(expressWinstonMiddleware); // log request + response

        expressApp.get('/', (req, res) => {
            res.sendFile(
                path.join(__dirname, '../../frontend/build', 'index.html'),
                {
                    headers: { 'Cache-Control': 'no-cache, private' },
                },
            );
        });

        /**
         * Service Container
         *
         * In a future iteration, the service repository will be aware of the surrounding
         * request context - for now we simply proxy the existing service repository singleton.
         */
        expressApp.use((req, res, next) => {
            req.services = this.serviceRepository;
            req.clients = this.clients;
            next();
        });

        // api router
        expressApp.use('/api/v1', apiV1Router);
        RegisterRoutes(expressApp);
        // Api docs
        if (
            this.lightdashConfig.mode === LightdashMode.PR ||
            this.environment !== 'production'
        ) {
            expressApp.get('/api/docs/openapi.json', (req, res) => {
                res.send(apiSpec);
            });
            expressApp.get(
                '/api/docs',
                reDoc({
                    title: 'Lightdash API Docs',
                    specUrl: '/api/docs/openapi.json',
                }),
            );
        }

        // frontend assets - immutable because vite appends hash to filenames
        expressApp.use(
            '/assets',
            expressStaticGzip(
                path.join(__dirname, '../../frontend/build/assets'),
                {
                    index: false,
                    customCompressions: [
                        {
                            encodingName: 'gzip',
                            fileExtension: 'gzip',
                        },
                    ],
                },
            ),
        );
        // frontend static files - no cache
        expressApp.use(
            express.static(path.join(__dirname, '../../frontend/build'), {
                setHeaders: () => ({
                    // private - browsers can cache but not CDNs
                    // no-cache - caches must revalidate with the origin server before using a cached copy
                    'Cache-Control': 'no-cache, private',
                }),
            }),
        );

        expressApp.get('*', (req, res) => {
            res.sendFile(
                path.join(__dirname, '../../frontend/build', 'index.html'),
                {
                    headers: { 'Cache-Control': 'no-cache, private' },
                },
            );
        });

        // Start the server
        expressApp.listen(this.port, () => {
            if (this.environment === 'production') {
                Logger.info(
                    `\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch lightdash at http://localhost:${this.port}\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`,
                );
            }
        });

        // Errors
        Sentry.setupExpressErrorHandler(expressApp);
        expressApp.use(
            (error: Error, req: Request, res: Response, _: NextFunction) => {
                const errorResponse = errorHandler(error);
                if (
                    error instanceof UnexpectedServerError ||
                    !(error instanceof LightdashError)
                ) {
                    console.error(error); // Log original error for debug purposes
                }
                Logger.error(
                    `Handled error of type ${errorResponse.name} on [${req.method}] ${req.path}`,
                    errorResponse,
                );
                this.analytics.track({
                    event: 'api.error',
                    userId: req.user?.userUuid,
                    anonymousId: !req.user?.userUuid
                        ? LightdashAnalytics.anonymousId
                        : undefined,
                    properties: {
                        name: errorResponse.name,
                        statusCode: errorResponse.statusCode,
                        route: req.path,
                        method: req.method,
                    },
                });
                res.status(errorResponse.statusCode).send({
                    status: 'error',
                    error: {
                        statusCode: errorResponse.statusCode,
                        name: errorResponse.name,
                        message: errorResponse.message,
                        data: errorResponse.data,
                        id:
                            errorResponse.statusCode === 500
                                ? Sentry.lastEventId()
                                : undefined,
                    },
                });
            },
        );

        // Authentication
        const userService = this.serviceRepository.getUserService();

        passport.use(apiKeyPassportStrategy({ userService }));
        passport.use(
            localPassportStrategy({
                userService,
            }),
        );
        if (googlePassportStrategy) {
            passport.use(googlePassportStrategy);
            refresh.use(googlePassportStrategy);
        }
        if (isOktaPassportStrategyAvailableToUse) {
            passport.use('okta', new OpenIDClientOktaStrategy());
        }
        if (oneLoginPassportStrategy) {
            passport.use('oneLogin', oneLoginPassportStrategy);
        }
        if (isAzureAdPassportStrategyAvailableToUse) {
            passport.use('azuread', await createAzureAdPassportStrategy());
        }
        if (isGenericOidcPassportStrategyAvailableToUse) {
            passport.use('oidc', await createGenericOidcPassportStrategy());
        }

        passport.serializeUser((user, done) => {
            // On login (user changes), user.userUuid is written to the session store in the `sess.passport.data` field
            done(null, {
                id: user.userUuid,
                organization: user.organizationUuid,
            });
        });

        // Before each request handler we read `sess.passport.user` from the session store
        passport.deserializeUser(
            async (
                passportUser: { id: string; organization: string },
                done,
            ) => {
                // Set the organization tag so we can filter by it in Sentry
                Sentry.setTag('organization', passportUser.organization);
                // Convert to a full user profile
                try {
                    done(null, await userService.findSessionUser(passportUser));
                } catch (e) {
                    done(e);
                }
            },
        );

        return expressApp;
    }

    private async initSlack(expressApp: Express) {
        const slackBot = this.slackBotFactory({
            lightdashConfig: this.lightdashConfig,
            analytics: this.analytics,
            serviceRepository: this.serviceRepository,
            models: this.models,
        });
        await slackBot.start(expressApp);
    }

    private initSchedulerWorker() {
        this.schedulerWorker = this.schedulerWorkerFactory({
            lightdashConfig: this.lightdashConfig,
            analytics: this.analytics,
            serviceRepository: this.serviceRepository,
            models: this.models,
            clients: this.clients,
            utils: this.utils,
        });

        this.schedulerWorker.run().catch((e) => {
            Logger.error('Error starting scheduler worker', e);
        });
    }

    async stop() {
        this.prometheusMetrics.stop();
        if (this.schedulerWorker && this.schedulerWorker.runner) {
            try {
                await this.schedulerWorker.runner.stop();
                Logger.info('Stopped scheduler worker');
            } catch (e) {
                Logger.error('Error stopping scheduler worker', e);
            }
        }
        if (postHogClient) {
            try {
                await postHogClient.shutdown();
                Logger.info('Stopped PostHog Client');
            } catch (e) {
                Logger.error('Error stopping PostHog Client', e);
            }
        }
    }
}
