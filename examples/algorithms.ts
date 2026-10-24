import { defineEnvironment } from '../src/environments/definitions';
import { buildExperiment, ExperimentSimulation, NavigationDomain } from '../src/algorithms';
import type { AlgorithmId, ExperimentConfig } from '../src/algorithms';
import { isMission, singleVessel, suggestMissionCentre } from '../src/algorithms';

/** No DOM, renderer or workbench required. Caller owns stepping, visualization and export. */
export function createWestlakeExperiment(algorithm: AlgorithmId = 'leader') {
  const spatial = defineEnvironment('westlake').spatial;
  const config: ExperimentConfig = {
    algorithm, start: [-60, 150], goal: [-850, -200], fleetSize: 6,
    speed: 4, spacing: 12, gain: 0.35, gridSize: 20,
    radius: 3, minY: -1, maxY: 2, formation: 'wedge',
    coverageWidth: 240, coverageHeight: 200, laneSpacing: 25,
  };
  if (isMission(algorithm)) {
    config.motion = 'dynamics'; config.vehicle = 'survey'; config.speed = 2; config.fleetSize = singleVessel(algorithm) ? 1 : 3;
    config.coverageWidth = 150; config.coverageHeight = 90; config.mission = { duration: 45, dwellTime: 4, laps: 1, targetSpeed: .8 };
    if (!['los', 'docking'].includes(algorithm)) config.start = suggestMissionCentre(new NavigationDomain(spatial, config), config.start, 150, 90, config.radius) ?? config.start;
    if (algorithm === 'docking') config.goal = [config.start[0], config.start[1] + 80];
    if (algorithm === 'station') { config.current = [.2, .1]; config.wind = [3, 0]; }
  }
  return new ExperimentSimulation(buildExperiment(spatial, config), new NavigationDomain(spatial, config));
}
