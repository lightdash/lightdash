type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const hasKey = (record: UnknownRecord, key: string) =>
    Object.prototype.hasOwnProperty.call(record, key);

const recordsOf = (value: unknown): [UnknownRecord, number][] =>
    Array.isArray(value)
        ? value.flatMap((item, index) =>
              isRecord(item) ? [[item, index] as [UnknownRecord, number]] : [],
          )
        : [];

// The first non-empty string among the item's identifying keys, else its position
const describe = (
    noun: string,
    item: UnknownRecord,
    index: number,
    names: unknown[],
) => {
    const name = names.find(
        (value): value is string => typeof value === 'string' && value !== '',
    );
    return name === undefined ? `${noun} ${index + 1}` : `${noun} "${name}"`;
};

const removed = (key: string, where: string, replacement: string) =>
    `\`${key}\` on ${where} was removed: use ${replacement}`;

/**
 * One message per dashboard-controls field removed from dashboard files, each
 * naming its replacement. Reads a raw parsed file, so any shape is accepted.
 */
export const getRemovedDashboardControlFieldMessages = (
    dashboard: unknown,
): string[] => {
    if (!isRecord(dashboard)) return [];
    const config = isRecord(dashboard.config) ? dashboard.config : {};
    const filters = isRecord(dashboard.filters) ? dashboard.filters : {};
    const dateZoom = isRecord(config.dateZoomConfig)
        ? config.dateZoomConfig
        : {};

    const configMessages = ['parameterSections', 'parameterSectionSlugs']
        .filter((key) => hasKey(config, key))
        .map(
            (key) =>
                `\`config.${key}\` was removed: use \`sectionSlug\` on each parameter control`,
        );

    const sectionMessages = recordsOf(config.controlSections).flatMap(
        ([section, index]) => {
            const where = describe('section', section, index, [
                section.slug,
                section.name,
            ]);
            return [
                ...(hasKey(section, 'id')
                    ? [removed('id', where, '`slug`')]
                    : []),
                ...(hasKey(section, 'inline')
                    ? [
                          removed(
                              'inline',
                              where,
                              '`newLine` on its `controlOrder` entry',
                          ),
                      ]
                    : []),
            ];
        },
    );

    const parameterMessages = recordsOf(config.parameterControls).flatMap(
        ([control, index]) => {
            const where = describe('parameter control', control, index, [
                control.slug,
                control.label,
                ...(isRecord(control.parameters)
                    ? Object.keys(control.parameters)
                    : []),
            ]);
            return [
                ...(hasKey(control, 'id')
                    ? [removed('id', where, '`slug`')]
                    : []),
                ...(hasKey(control, 'sectionId')
                    ? [removed('sectionId', where, '`sectionSlug`')]
                    : []),
            ];
        },
    );

    const filterMessages = (
        [
            ['dimensions', 'dimension filter'],
            ['metrics', 'metric filter'],
            ['tableCalculations', 'table calculation filter'],
        ] as const
    ).flatMap(([key, noun]) =>
        recordsOf(filters[key]).flatMap(([rule, index]) =>
            hasKey(rule, 'sectionId')
                ? [
                      removed(
                          'sectionId',
                          describe(noun, rule, index, [
                              rule.slug,
                              rule.label,
                              isRecord(rule.target)
                                  ? rule.target.fieldId
                                  : undefined,
                          ]),
                          '`sectionSlug`',
                      ),
                  ]
                : [],
        ),
    );

    const dateZoomMessages = recordsOf(dateZoom.controls).flatMap(
        ([control, index]) =>
            hasKey(control, 'sectionId')
                ? [
                      removed(
                          'sectionId',
                          describe('date zoom control', control, index, [
                              control.name,
                              control.uuid,
                          ]),
                          '`sectionSlug`',
                      ),
                  ]
                : [],
    );

    return [
        ...configMessages,
        ...sectionMessages,
        ...parameterMessages,
        ...filterMessages,
        ...dateZoomMessages,
    ];
};
