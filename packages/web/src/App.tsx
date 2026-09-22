import type { TimeWindow } from "@spout/contracts";
import { useState } from "react";
import styles from "./App.module.css";
import { ApiStatusIndicator } from "./components/ApiStatusIndicator.js";
import { MapCanvas } from "./components/map/MapCanvas.js";
import { DataCreditsPanel } from "./features/credits/DataCreditsPanel.js";
import { FilterBar } from "./features/filters/FilterBar.js";
import { ProbabilityLayer } from "./features/probability/ProbabilityLayer.js";
import { DateControl } from "./features/seasonality/DateControl.js";
import { GlobalDensityLayer } from "./features/sightings/GlobalDensityLayer.js";
import { RecencyStamp } from "./features/sightings/RecencyStamp.js";
import { SightingsLayer } from "./features/sightings/SightingsLayer.js";
import { ProbabilityGridProvider } from "./lib/ProbabilityGridProvider.js";

/** ADR 0003: the sightings layer defaults to the last 30 days, never all-time. */
const DEFAULT_WINDOW: TimeWindow = "30d";

/** YYYY-MM-DD, local — matches the shape `DateControl`'s native date input and `/api/seasonality` both expect. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function App() {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(DEFAULT_WINDOW);
  const [date, setDate] = useState<string>(today);

  return (
    <ProbabilityGridProvider>
      <div className={styles.app}>
        <MapCanvas>
          <ProbabilityLayer />
          <GlobalDensityLayer />
          <SightingsLayer timeWindow={timeWindow} date={date} />
        </MapCanvas>
        <FilterBar value={timeWindow} onChange={setTimeWindow} />
        <DateControl value={date} onChange={setDate} />
        <RecencyStamp />
        <ApiStatusIndicator />
        <DataCreditsPanel />
      </div>
    </ProbabilityGridProvider>
  );
}
