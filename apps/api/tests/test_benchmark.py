from app.benchmarks.run import load_cases, run_benchmark


def test_benchmark_contains_ten_scenarios_and_baseline_reports_requested_metrics():
    cases = load_cases()
    assert len(cases) == 10
    assert {case.name for case in cases} == {
        "schema_type_drift",
        "missing_partition",
        "duplicate_ingestion",
        "unexpected_null_spike",
        "pipeline_timeout",
        "broken_sql_deployment",
        "stale_upstream_source",
        "connector_authentication_failure",
        "incorrect_join_row_explosion",
        "delayed_ingestion_dashboard_freshness",
    }

    report = run_benchmark(mode="baseline")
    assert report["case_count"] == 10
    assert report["mode"] == "rules_baseline"
    assert report["metrics"]["root_cause_category_accuracy"] == 1.0
    assert report["metrics"]["affected_asset_recall"] == 1.0
    assert "average_tool_calls_per_investigation" in report["metrics"]
    assert "average_investigation_latency_ms" in report["metrics"]
