import { getAgentCallOptions } from './AiAgentService';

describe('getAgentCallOptions', () => {
    const callOptions = {
        temperature: 0.2,
        maxOutputTokens: 4_096,
    };

    it('allows the judge to produce the maximum validated report size', () => {
        expect(
            getAgentCallOptions(callOptions, {
                mode: 'deep_research',
                runUuid: 'run-uuid',
                phase: 'synthesizing',
                budget: {
                    maxTokens: 1_000,
                    maxToolCalls: 10,
                    maxWarehouseQueries: 1,
                    maxHypotheses: 1,
                    maxResultRows: 100,
                },
                research: {
                    role: 'judge',
                    investigations: [],
                    chartCandidates: [],
                },
            }),
        ).toEqual({
            temperature: 0.2,
            maxOutputTokens: 16_384,
        });
    });

    it.each(['planner', 'investigator'] as const)(
        'keeps the configured options for the %s',
        (role) => {
            expect(
                getAgentCallOptions(callOptions, {
                    mode: 'deep_research',
                    runUuid: 'run-uuid',
                    phase: role === 'planner' ? 'planning' : 'investigating',
                    budget: {
                        maxTokens: 1_000,
                        maxToolCalls: 10,
                        maxWarehouseQueries: 1,
                        maxHypotheses: 1,
                        maxResultRows: 100,
                    },
                    research:
                        role === 'planner'
                            ? {
                                  role,
                                  maxHypotheses: 1,
                                  onHypotheses: vi.fn(),
                              }
                            : {
                                  role,
                                  hypothesis: {
                                      id: 'hypothesis-1',
                                      claim: 'Claim',
                                      rationale: 'Rationale',
                                      supportingEvidence: 'Support',
                                      falsifyingEvidence: 'Falsify',
                                  },
                                  onReport: vi.fn(),
                              },
                }),
            ).toBe(callOptions);
        },
    );

    it('keeps the configured options for standard responses', () => {
        expect(getAgentCallOptions(callOptions, { mode: 'standard' })).toBe(
            callOptions,
        );
    });
});
