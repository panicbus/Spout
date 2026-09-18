import type { ReactNode } from "react";
import styles from "./MapCanvas.module.css";
import { MapContextProvider } from "./MapContext.js";
import { useMapInstance } from "./useMapInstance.js";

export interface MapCanvasProps {
  /**
   * Feature layers and map overlays. Rendered as siblings of the actual
   * MapLibre container div, never inside it — MapLibre manages that
   * div's DOM imperatively (it injects its own canvas and controls), and
   * letting React manage children of the same node risks both fighting
   * over it during a re-render.
   */
  children?: ReactNode;
}

/**
 * Thin by design (deletion test: delete this file and the map lifecycle
 * logic in `useMapInstance` is unaffected). Provides the map instance via
 * `MapContext` so `children` (feature layers) can reach it with `useMap()`
 * instead of it being threaded through props.
 */
export function MapCanvas({ children }: MapCanvasProps) {
  const { containerRef, map } = useMapInstance();
  return (
    <MapContextProvider value={map}>
      <div className={styles.wrapper}>
        <div ref={containerRef} className={styles.canvas} data-testid="map-canvas" />
        {children}
      </div>
    </MapContextProvider>
  );
}
