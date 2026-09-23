import { describe, expect, it } from "vitest";
import { MAP_STYLE } from "./mapConfig.js";

describe("MAP_STYLE", () => {
  it("renders Esri's Ocean Base raster tiles as the visible basemap", () => {
    const rasterLayer = MAP_STYLE.layers.find((l) => l.type === "raster");
    expect(rasterLayer).toBeDefined();
    const source = MAP_STYLE.sources[rasterLayer!.source as string];
    expect(source).toMatchObject({
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"],
    });
  });

  // SightingsLayer.tsx's BASEMAP_WATER_LAYER_ID ("water") depends on this
  // exact layer existing and being queryable — the Esri raster above has
  // no vector geometry of its own, so this is the only thing that can
  // answer "did this tap land on water" for the seasonality-card gate.
  it("declares an invisible 'water' layer, queryable but not rendered, for the land/water tap gate", () => {
    const waterLayer = MAP_STYLE.layers.find((l) => l.id === "water");
    expect(waterLayer).toMatchObject({
      type: "fill",
      "source-layer": "water",
      paint: { "fill-opacity": 0 },
    });
    const source = MAP_STYLE.sources[(waterLayer as { source: string }).source];
    expect(source).toMatchObject({ type: "vector" });
  });
});
