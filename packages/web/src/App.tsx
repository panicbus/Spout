import styles from "./App.module.css";
import { ApiStatusIndicator } from "./components/ApiStatusIndicator.js";
import { MapCanvas } from "./components/map/MapCanvas.js";
import { ProbabilityLayer } from "./features/probability/ProbabilityLayer.js";

export function App() {
  return (
    <div className={styles.app}>
      <MapCanvas>
        <ProbabilityLayer />
      </MapCanvas>
      <ApiStatusIndicator />
    </div>
  );
}
