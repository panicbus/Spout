import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import * as maplibreMock from "./maplibre-mock.js";

vi.mock("maplibre-gl", () => maplibreMock);

// vitest.config.ts does not set `test.globals: true`, so React Testing
// Library's own auto-cleanup (which checks for a global `afterEach`)
// never fires. Without this, mounted component trees — and the map
// instances/effects they own — leak across tests in the same file.
afterEach(cleanup);
