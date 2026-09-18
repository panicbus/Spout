import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MAP_STYLE_URL } from "../../lib/mapConfig.js";
import { mapInstances, resetMaplibreMock } from "../../test/maplibre-mock.js";
import { MapCanvas } from "./MapCanvas.js";

describe("MapCanvas", () => {
  beforeEach(() => resetMaplibreMock());

  it("renders a full-bleed container and mounts a MapLibre map against it", () => {
    render(<MapCanvas />);

    expect(screen.getByTestId("map-canvas")).toBeInTheDocument();
    expect(mapInstances).toHaveLength(1);
    expect(mapInstances[0]?.options.style).toBe(MAP_STYLE_URL);
  });

  it("removes the map on unmount so navigating away doesn't leak a WebGL context", () => {
    const { unmount } = render(<MapCanvas />);
    unmount();
    expect(mapInstances[0]?.remove).toHaveBeenCalledOnce();
  });
});
