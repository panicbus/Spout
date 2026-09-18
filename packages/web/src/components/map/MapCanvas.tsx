import styles from "./MapCanvas.module.css";
import { useMapInstance } from "./useMapInstance.js";

/**
 * Thin by design (deletion test: delete this file and the map lifecycle
 * logic in `useMapInstance` is unaffected). Feature layers mount onto the
 * `map` this hook exposes rather than being children of this component.
 */
export function MapCanvas() {
  const { containerRef } = useMapInstance();
  return <div ref={containerRef} className={styles.canvas} data-testid="map-canvas" />;
}
