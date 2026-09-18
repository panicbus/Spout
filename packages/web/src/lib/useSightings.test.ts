import { renderHook, waitFor } from "@testing-library/react";
import type { SightingsQuery } from "@spout/contracts";
import { buildSighting } from "@spout/contracts/fixtures.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "./apiClient.js";
import { useSightings } from "./useSightings.js";

vi.mock("./apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("./apiClient.js");
  return { ...actual, fetchSightings: vi.fn() };
});

describe("useSightings", () => {
  beforeEach(() => {
    vi.mocked(apiClient.fetchSightings).mockReset();
  });

  it("fetches with the given params and returns sightings once resolved", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting({ id: "a" })]);

    const { result } = renderHook(() => useSightings({ species: ["orca"] }));

    await waitFor(() => expect(result.current.state).toBe("ok"));
    expect(apiClient.fetchSightings).toHaveBeenCalledWith({ species: ["orca"] });
    expect(result.current.state === "ok" && result.current.data).toHaveLength(1);
  });

  it("refetches when params change", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([]);

    const { rerender } = renderHook(({ params }: { params: Partial<SightingsQuery> }) => useSightings(params), {
      initialProps: { params: { window: "30d" } },
    });
    await waitFor(() => expect(apiClient.fetchSightings).toHaveBeenCalledTimes(1));

    rerender({ params: { window: "12m" } });
    await waitFor(() => expect(apiClient.fetchSightings).toHaveBeenCalledTimes(2));
  });

  it("does not refetch when params are a new object with the same values", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([]);

    const { rerender } = renderHook(({ params }: { params: Partial<SightingsQuery> }) => useSightings(params), {
      initialProps: { params: { species: ["orca"] } },
    });
    await waitFor(() => expect(apiClient.fetchSightings).toHaveBeenCalledTimes(1));

    rerender({ params: { species: ["orca"] } }); // new array reference, same contents

    // give a tick for any (incorrect) refetch to have started
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiClient.fetchSightings).toHaveBeenCalledTimes(1);
  });
});
