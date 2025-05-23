import { produce } from 'immer';
import { AiAgentService } from './AiAgentService';

describe('AiService', () => {
    test('should throw when explore does not have a base table', async () => {
        expect(() =>
            AiAgentService.filterExplore({
                availableTags: ['zap'],
                explore: {
                    baseTable: 'base',
                    tags: ['zip', 'zap'],
                    tables: {
                        // base instead of baze
                        baze: {
                            dimensions: {},
                            metrics: {},
                        },
                    },
                },
            }),
        ).toThrow('Base table not found');
    });

    test('should return explore when available tags are not configured', async () => {
        expect(
            AiAgentService.filterExplore({
                availableTags: null,
                explore: {
                    baseTable: 'base',
                    tags: [],
                    tables: {
                        base: {
                            dimensions: {
                                paz: {
                                    tags: ['zip'],
                                },
                            },
                            metrics: {
                                piz: {},
                            },
                        },
                    },
                },
            }),
        ).toBeDefined();
    });

    test('should return undefined when available tags an empty array', async () => {
        expect(
            AiAgentService.filterExplore({
                availableTags: [],
                explore: {
                    baseTable: 'base',
                    tags: [],
                    tables: {
                        base: {
                            dimensions: {
                                paz: {
                                    tags: ['zip'],
                                },
                            },
                            metrics: {
                                piz: {},
                            },
                        },
                    },
                },
            }),
        ).toBeUndefined();
    });

    test('should return undefined when explore or fields have no tags', async () => {
        expect(
            AiAgentService.filterExplore({
                availableTags: ['zap'],
                explore: {
                    baseTable: 'base',
                    tags: [],
                    tables: {
                        base: {
                            dimensions: {},
                            metrics: {},
                        },
                    },
                },
            }),
        ).toBeUndefined();
    });

    test('should return explore when explore tag matches', async () => {
        expect(
            AiAgentService.filterExplore({
                availableTags: ['zip', 'zap'],
                explore: {
                    baseTable: 'base',
                    tags: ['zap', 'zup'],
                    tables: {
                        base: {
                            dimensions: {},
                            metrics: {},
                        },
                    },
                },
            }),
        ).toBeDefined();
    });

    test('should return explore when any of the field tag matches', async () => {
        expect(
            AiAgentService.filterExplore({
                availableTags: ['zip', 'zap'],
                explore: {
                    baseTable: 'base',
                    tags: ['zup'],
                    tables: {
                        base: {
                            dimensions: {
                                paz: {
                                    tags: ['zap'],
                                },
                            },
                            metrics: {
                                piz: {
                                    tags: ['zzzzz'],
                                },
                            },
                        },
                    },
                },
            }),
        ).toBeDefined();
    });

    test('should return explore when either explore or any of the field tag matches', async () => {
        expect(
            AiAgentService.filterExplore({
                availableTags: ['zip', 'zap'],
                explore: {
                    baseTable: 'base',
                    tags: ['zap'],
                    tables: {
                        base: {
                            dimensions: {
                                paz: {
                                    tags: ['zip'],
                                },
                            },
                            metrics: {
                                piz: {
                                    tags: ['zap'],
                                },
                            },
                        },
                    },
                },
            }),
        ).toBeDefined();
    });

    test('should return undefined when neither explore nor any of the field tag matches', async () => {
        expect(
            AiAgentService.filterExplore({
                availableTags: ['zip', 'zap'],
                explore: {
                    baseTable: 'base',
                    tags: ['zup'],
                    tables: {
                        base: {
                            dimensions: {
                                paz: {
                                    tags: [],
                                },
                                puz: {
                                    tags: ['zup'],
                                },
                            },
                            metrics: {
                                piz: {},
                            },
                        },
                    },
                },
            }),
        ).toBeUndefined();
    });

    test('should return undefined when explore+base table does not match and only joined table fields match', async () => {
        expect(
            AiAgentService.filterExplore({
                availableTags: ['zip', 'zap'],
                explore: {
                    baseTable: 'base',
                    tags: ['zup'],
                    tables: {
                        base: {
                            dimensions: {
                                paz: {
                                    tags: [],
                                },
                                puz: {
                                    tags: ['zup'],
                                },
                            },
                            metrics: {
                                piz: {},
                            },
                        },
                        another_table: {
                            dimensions: {
                                sup: {
                                    tags: ['zip', 'zap'],
                                },
                            },
                            metrics: {
                                sap: {
                                    tags: ['zip', 'zap'],
                                },
                            },
                        },
                    },
                },
            }),
        ).toBeUndefined();
    });

    test('should not filter out anything from the explore when explore has tags but base table fields does not have matching tags', async () => {
        const explore = {
            baseTable: 'base',
            tags: ['zap'],
            tables: {
                base: {
                    dimensions: {
                        paz: {
                            tags: [],
                        },
                        puz: {
                            tags: ['zup'],
                        },
                    },
                    metrics: {
                        piz: {},
                    },
                },
                another_table: {
                    dimensions: {
                        sup: {
                            tags: ['zip', 'zap'],
                        },
                    },
                    metrics: {
                        sap: {
                            tags: ['zip', 'zap'],
                        },
                    },
                },
            },
        };

        expect(
            AiAgentService.filterExplore({
                availableTags: ['zip', 'zap'],
                explore,
            }),
        ).toStrictEqual(explore);
    });

    test('should filter out fields from the explore when explore has no tags but other table fields have matching tags', async () => {
        const explore = {
            baseTable: 'base',
            tags: [],
            tables: {
                base: {
                    dimensions: {
                        paz: {
                            tags: ['zup', 'zap'],
                        },
                        puz: {
                            tags: ['zup'],
                        },
                    },
                    metrics: {
                        piz: {},
                    },
                },
                another_table: {
                    dimensions: {
                        sup: {
                            tags: ['zip', 'zap'],
                        },
                    },
                    metrics: {
                        sap: {
                            tags: ['zip'],
                        },
                    },
                },
            },
        };

        expect(
            AiAgentService.filterExplore({
                availableTags: ['zap'],
                explore,
            }),
        ).toStrictEqual(
            produce(explore, (draft) => {
                // @ts-ignore
                // eslint-disable-next-line no-param-reassign, @typescript-eslint/dot-notation
                delete draft.tables['base'].dimensions['puz'];
                // @ts-ignore
                // eslint-disable-next-line no-param-reassign, @typescript-eslint/dot-notation
                delete draft.tables['base'].metrics['piz'];
                // @ts-ignore
                // eslint-disable-next-line no-param-reassign, @typescript-eslint/dot-notation
                delete draft.tables['another_table'].metrics['sap'];
            }),
        );
    });

    test('should filter out fields from the explore when explore has matching tags but other table fields have matching tags', async () => {
        const explore = {
            baseTable: 'base',
            tags: ['zap'],
            tables: {
                base: {
                    dimensions: {
                        paz: {
                            tags: ['zup', 'zap'],
                        },
                        puz: {
                            tags: ['zup'],
                        },
                    },
                    metrics: {
                        piz: {},
                    },
                },
                another_table: {
                    dimensions: {
                        sup: {
                            tags: ['zip', 'zap'],
                        },
                    },
                    metrics: {
                        sap: {
                            tags: ['zip'],
                        },
                    },
                },
            },
        };

        expect(
            AiAgentService.filterExplore({
                availableTags: ['zap'],
                explore,
            }),
        ).toStrictEqual(
            produce(explore, (filteredExplore) => {
                // @ts-ignore
                // eslint-disable-next-line no-param-reassign, @typescript-eslint/dot-notation
                delete filteredExplore.tables['base'].dimensions['puz'];
                // @ts-ignore
                // eslint-disable-next-line no-param-reassign, @typescript-eslint/dot-notation
                delete filteredExplore.tables['base'].metrics['piz'];
                // @ts-ignore
                // eslint-disable-next-line no-param-reassign, @typescript-eslint/dot-notation
                delete filteredExplore.tables['another_table'].metrics['sap'];
            }),
        );
    });
});
