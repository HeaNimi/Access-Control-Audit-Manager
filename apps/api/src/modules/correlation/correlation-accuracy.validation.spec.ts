import {
  CORRELATION_VALIDATION_SCENARIOS,
  evaluateCorrelationValidationScenarios,
  formatCorrelationValidationReport,
} from './correlation-validation.fixtures';

describe('correlation accuracy validation', () => {
  it('classifies representative request-event pairs without false positives or false negatives', () => {
    const report = evaluateCorrelationValidationScenarios();

    process.stdout.write(`\n${formatCorrelationValidationReport(report)}\n`);

    expect(report.metrics.scenarioCount).toBeGreaterThanOrEqual(20);
    expect(report.metrics.candidatePairCount).toBeGreaterThanOrEqual(20);
    expect(report.metrics.falsePositives).toBe(0);
    expect(report.metrics.falseNegatives).toBe(0);
    expect(report.metrics.precision).toBe(1);
    expect(report.metrics.recall).toBe(1);
    expect(report.metrics.f1).toBe(1);
    expect(report.metrics.failedCandidateIds).toEqual([]);
    expect(report.metrics.signalFailureIds).toEqual([]);
    expect(report.aggregateSignalFailures).toEqual([]);
  });

  it.each(CORRELATION_VALIDATION_SCENARIOS)('$id: $label', (scenario) => {
    const report = evaluateCorrelationValidationScenarios([scenario]);

    expect(report.metrics.failedCandidateIds).toEqual([]);
    expect(report.metrics.signalFailureIds).toEqual([]);
    expect(report.aggregateSignalFailures).toEqual([]);
  });
});
