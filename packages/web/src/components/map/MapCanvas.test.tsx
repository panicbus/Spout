import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MAP_STYLE_URL } from "../../lib/mapConfig.js";
import { mapInstances, resetMaplibreMock } from "../../test/maplibre-mock.js";
import { MapCanvas } from "./MapCanvas.js";
import { useMap } from "./MapContext.js";

function ChildThatNeedsTheMap() {
  const map = useMap();
  return <span data-testid="child-saw-map">{map ? "has-map" : "no-map"}</span>;
}

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

  it("provides the constructed map to children via context, not as a prop", async () => {
    render(
      <MapCanvas>
        <ChildThatNeedsTheMap />
      </MapCanvas>,
    );

    await waitFor(() => expect(screen.getByTestId("child-saw-map")).toHaveTextContent("has-map"));
  });

  it("renders children as siblings of the MapLibre container div, not inside it", () => {
    render(
      <MapCanvas>
        <ChildThatNeedsTheMap />
      </MapCanvas>,
    );

    const mapDiv = screen.getByTestId("map-canvas");
    const child = screen.getByTestId("child-saw-map");
    expect(mapDiv.contains(child)).toBe(false);
  });
});
