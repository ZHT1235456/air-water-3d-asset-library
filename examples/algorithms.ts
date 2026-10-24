import { defineEnvironment } from '../src/environments/definitions';
import { buildExperiment, ExperimentSimulation, NavigationDomain } from '../src/algorithms';
import type { AlgorithmId, ExperimentConfig } from '../src/algorithms';

/** No DOM, renderer or workbench required. Caller owns stepping, visualization and export. */
export function createWestlakeExperiment(algorithm: AlgorithmId = 'leader') {
  const spatial = defineEnvironment('westlake').spatial;
  const config: ExperimentConfig = {
    algorithm, start: [-60, 150], goal: [-850, -200], fleetSize: 6,
    speed: 4, spacing: 12, gain: 0.35, gridSize: 20,
    radius: 3, minY: -1, maxY: 2, formation: 'wedge',
    coverageWidth: 240, coverageHeight: 200, laneSpacing: 25,
  };
  return new ExperimentSimulation(buildExperiment(spatial, config), new NavigationDomain(spatial, config));
}
