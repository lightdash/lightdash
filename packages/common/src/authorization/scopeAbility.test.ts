import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { type CreateEmbedJwt } from '../ee';
import { applyEmbeddedAbility } from './scopeAbility';
import { type MemberAbility } from './types';

const createEmbedJwt = (overrides?: {
    content?: Partial<CreateEmbedJwt['content']>;
    exp?: number;
    iat?: number;
    userAttributes?: { [key: string]: string };
    user?: CreateEmbedJwt['user'];
}): CreateEmbedJwt => {
    const baseContent = {
        type: 'dashboard',
        projectUuid: 'project-uuid-1',
        dashboardUuid: 'dashboard-uuid-1',
        canExportCsv: false,
        canExportImages: false,
        canExportPagePdf: false,
        canDateZoom: false,
    };

    const { content: contentOverrides, ...otherOverrides } = overrides || {};

    return {
        content: {
            ...baseContent,
            ...contentOverrides,
        } as CreateEmbedJwt['content'],
        exp: Date.now() / 1000 + 3600, // 1 hour from now
        ...otherOverrides,
    };
};
const organization = {
    organizationUuid: 'organization-uuid-1',
    name: 'Organization 1',
};

const defineAbilityForEmbedUser = (
    embedUser: CreateEmbedJwt,
    dashboardUuid: string,
): MemberAbility => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    applyEmbeddedAbility(embedUser, dashboardUuid, organization, builder);
    return builder.build();
};

describe('Embedded dashboard abilities', () => {
    const dashboardUuid = 'dashboard-uuid-1';
    const projectUuid = 'project-uuid-1';

    describe('Base abilities', () => {
        it('should allow viewing the specified dashboard', () => {
            const embedUser = createEmbedJwt();
            const ability = defineAbilityForEmbedUser(embedUser, dashboardUuid);

            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        dashboardUuid,
                        organizationUuid: organization.organizationUuid,
                    }),
                ),
            ).toBe(true);
        });

        it('should not allow viewing private saved charts', () => {
            const embedUser = createEmbedJwt();
            const ability = defineAbilityForEmbedUser(embedUser, dashboardUuid);

            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        projectUuid,
                        isPrivate: true,
                    }),
                ),
            ).toBe(false);
        });

        it('should not allow viewing saved charts from different projects', () => {
            const embedUser = createEmbedJwt();
            const ability = defineAbilityForEmbedUser(embedUser, dashboardUuid);

            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        projectUuid: 'different-project-uuid',
                        isPrivate: false,
                    }),
                ),
            ).toBe(false);
        });

        it('should handle missing optional properties gracefully', () => {
            const embedUser: CreateEmbedJwt = {
                content: {
                    type: 'dashboard',
                    projectUuid: 'project-uuid-1',
                    dashboardUuid: 'dashboard-uuid-1',
                },
                exp: Date.now() / 1000 + 3600,
            };
            const ability = defineAbilityForEmbedUser(embedUser, dashboardUuid);

            // Base abilities should still work
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        dashboardUuid,
                        organizationUuid: organization.organizationUuid,
                    }),
                ),
            ).toBe(true);

            // Export abilities should default to false
            expect(
                ability.can(
                    'export',
                    subject('Dashboard', {
                        type: 'csv',
                        organizationUuid: organization.organizationUuid,
                    }),
                ),
            ).toBe(false);
            expect(
                ability.can(
                    'export',
                    subject('Dashboard', {
                        type: 'pdf',
                        organizationUuid: organization.organizationUuid,
                    }),
                ),
            ).toBe(false);
            expect(
                ability.can(
                    'export',
                    subject('Dashboard', {
                        type: 'images',
                        organizationUuid: organization.organizationUuid,
                    }),
                ),
            ).toBe(false);

            // Date zoom should default to false
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', { canDateZoom: true }),
                ),
            ).toBe(false);
        });
    });

    describe('Export abilities', () => {
        describe('CSV export', () => {
            it('should allow CSV export when canExportCsv is true', () => {
                const embedUser = createEmbedJwt({
                    content: { canExportCsv: true },
                });
                const ability = defineAbilityForEmbedUser(
                    embedUser,
                    dashboardUuid,
                );

                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'csv',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(true);
            });

            it('should not allow CSV export when canExportCsv is false', () => {
                const embedUser = createEmbedJwt({
                    content: { canExportCsv: false },
                });
                const ability = defineAbilityForEmbedUser(
                    embedUser,
                    dashboardUuid,
                );

                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'csv',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(false);
            });
        });

        describe('PDF export', () => {
            it('should allow PDF export when canExportPagePdf is true', () => {
                const embedUser = createEmbedJwt({
                    content: { canExportPagePdf: true },
                });
                const ability = defineAbilityForEmbedUser(
                    embedUser,
                    dashboardUuid,
                );

                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'pdf',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(true);
            });

            it('should not allow PDF export when canExportPagePdf is false', () => {
                const embedUser = createEmbedJwt({
                    content: { canExportPagePdf: false },
                });
                const ability = defineAbilityForEmbedUser(
                    embedUser,
                    dashboardUuid,
                );

                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'pdf',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(false);
            });
        });

        describe('Images export', () => {
            it('should allow images export when canExportImages is true', () => {
                const embedUser = createEmbedJwt({
                    content: { canExportImages: true },
                });
                const ability = defineAbilityForEmbedUser(
                    embedUser,
                    dashboardUuid,
                );

                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'images',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(true);
            });

            it('should not allow images export when canExportImages is false', () => {
                const embedUser = createEmbedJwt({
                    content: { canExportImages: false },
                });
                const ability = defineAbilityForEmbedUser(
                    embedUser,
                    dashboardUuid,
                );

                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'images',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(false);
            });
        });

        describe('Multiple export formats', () => {
            it('should allow all export formats when all are enabled', () => {
                const embedUser = createEmbedJwt({
                    content: {
                        canExportCsv: true,
                        canExportPagePdf: true,
                        canExportImages: true,
                    },
                });
                const ability = defineAbilityForEmbedUser(
                    embedUser,
                    dashboardUuid,
                );

                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'csv',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(true);
                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'pdf',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(true);
                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'images',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(true);
            });

            it('should allow only CSV and PDF when images is disabled', () => {
                const embedUser = createEmbedJwt({
                    content: {
                        canExportCsv: true,
                        canExportPagePdf: true,
                        canExportImages: false,
                    },
                });
                const ability = defineAbilityForEmbedUser(
                    embedUser,
                    dashboardUuid,
                );

                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'csv',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(true);
                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'pdf',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(true);
                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'images',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(false);
            });

            it('should not allow any exports when all are disabled', () => {
                const embedUser = createEmbedJwt({
                    content: {
                        canExportCsv: false,
                        canExportPagePdf: false,
                        canExportImages: false,
                    },
                });
                const ability = defineAbilityForEmbedUser(
                    embedUser,
                    dashboardUuid,
                );

                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'csv',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(false);
                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'pdf',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(false);
                expect(
                    ability.can(
                        'export',
                        subject('Dashboard', {
                            type: 'images',
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(false);
            });
        });
    });

    describe('Dashboard abilities', () => {
        describe('Date zoom', () => {
            it('should allow date zoom when canDateZoom is true', () => {
                const embedUser = createEmbedJwt({
                    content: { canDateZoom: true },
                });
                const ability = defineAbilityForEmbedUser(
                    embedUser,
                    dashboardUuid,
                );

                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            dateZoom: true,
                            organizationUuid: organization.organizationUuid,
                        }),
                    ),
                ).toBe(true);
            });

            it('should not allow date zoom when canDateZoom is false', () => {
                const embedUser = createEmbedJwt({
                    content: { canDateZoom: false },
                });
                const ability = defineAbilityForEmbedUser(
                    embedUser,
                    dashboardUuid,
                );

                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', { dateZoom: true }),
                    ),
                ).toBe(false);
            });

            it('should handle undefined canDateZoom as false', () => {
                const embedUser = createEmbedJwt({
                    content: { canDateZoom: undefined },
                });
                const ability = defineAbilityForEmbedUser(
                    embedUser,
                    dashboardUuid,
                );

                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', { canDateZoom: true }),
                    ),
                ).toBe(false);
            });
        });
    });
});
