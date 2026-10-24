import { buildExperiment } from './experiment';
import type { SpatialData } from '../environments/types';
import type { ExperimentConfig } from './types';

self.onmessage = (event: MessageEvent<{ spatial: SpatialData; config: ExperimentConfig }>) => {
  try { self.postMessage({ plan: buildExperiment(event.data.spatial, event.data.config) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
