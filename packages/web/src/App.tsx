import styles from "./App.module.css";
import { ApiStatusIndicator } from "./components/ApiStatusIndicator.js";
import { MapCanvas } from "./components/map/MapCanvas.js";
import { ProbabilityLayer } from "./features/probability/ProbabilityLayer.js";
import { SightingsLayer } from "./features/sightings/SightingsLayer.js";

export function App() {
  return (
    <div className={styles.app}>
      <MapCanvas>
        <ProbabilityLayer />
        <SightingsLayer />
      </MapCanvas>
      <ApiStatusIndicator />
    </div>
  );
}
