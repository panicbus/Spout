import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for the test setup itself, not a feature. vitest does
 * not set `test.globals: true` in this project, so React Testing
 * Library's automatic per-test cleanup silently never runs unless
 * `setup.ts` calls `afterEach(cleanup)` explicitly. If that call is ever
 * removed, this is the test that catches it — every other test file would
 * otherwise start leaking mounted trees across tests without any single
 * test failing outright.
 */
describe("test setup: RTL cleanup between tests", () => {
  it("mounts a probe element", () => {
    render(<div data-testid="cleanup-probe" />);
    expect(document.body.querySelectorAll('[data-testid="cleanup-probe"]')).toHaveLength(1);
  });

  it("no longer sees the previous test's probe element", () => {
    expect(document.body.querySelectorAll('[data-testid="cleanup-probe"]')).toHaveLength(0);
  });
});
