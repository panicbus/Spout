import type { TimeWindow } from "@spout/contracts";
import { useState } from "react";
import styles from "./App.module.css";
import { ApiStatusIndicator } from "./components/ApiStatusIndicator.js";
import { MapCanvas } from "./components/map/MapCanvas.js";
import { FilterBar } from "./features/filters/FilterBar.js";
import { ProbabilityLayer } from "./features/probability/ProbabilityLayer.js";
import { RecencyStamp } from "./features/sightings/RecencyStamp.js";
import { SightingsLayer } from "./features/sightings/SightingsLayer.js";

/** ADR 0003: the sightings layer defaults to the last 30 days, never all-time. */
const DEFAULT_WINDOW: TimeWindow = "30d";

export function App() {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(DEFAULT_WINDOW);

  return (
    <div className={styles.app}>
      <MapCanvas>
        <ProbabilityLayer />
        <SightingsLayer timeWindow={timeWindow} />
      </MapCanvas>
      <FilterBar value={timeWindow} onChange={setTimeWindow} />
      <RecencyStamp />
      <ApiStatusIndicator />
    </div>
  );
}
