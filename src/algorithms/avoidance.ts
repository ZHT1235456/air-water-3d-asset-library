import { steerUSV, USVDynamics, type WaterConditions } from '../dynamics';
import type { Point2 } from '../environments/types';
import { distance, NavigationDomain, sweptSeparation } from './navigation';

type Prediction = Point2[];
/** Velocity sampling with full marine-model rollouts, rather than moving a point along an arc.
 * Other vessels follow their last selected velocity during prediction. This is a local baseline,
 * not a COLREGs implementation or a guarantee under unobserved changes in intent. */
export class PredictiveAvoidance {
  private nextUpdate = 0;
  private selected: Point2[] = [];
  interventions = 0;
  private predict(body: USVDynamics, velocity: Point2, env: WaterConditions): Prediction {
    const copy = new USVDynamics(body.profile); Object.assign(copy.state, body.snapshot());
    const positions: Prediction = [[...copy.state.position]];
    for (let j = 0; j < 60; j++) {
      copy.step(.1, steerUSV(copy, velocity, env, { allowReverse: false }), env);
      positions.push([...copy.state.position]);
    }
    return positions;
  }
  command(time: number, bodies: USVDynamics[], nominal: Point2[], domain: NavigationDomain, radius: number, env: WaterConditions): Point2[] {
    if (time + 1e-8 < this.nextUpdate && this.selected.length === bodies.length) return this.selected;
    this.nextUpdate = time + .5;
    const forecasts = bodies.map((b, i) => this.predict(b, this.selected[i] ?? nominal[i], env));
    this.selected = bodies.map((body, i) => {
      const speed = Math.hypot(...nominal[i]), heading = speed > .01 ? Math.atan2(nominal[i][0], nominal[i][1]) : body.state.yaw;
      const candidates: { velocity: Point2; angle: number }[] = [{ velocity: [0, 0], angle: 0 }];
      for (const factor of [1, .5]) for (const angle of [0, -.35, .35, -.7, .7, -1.05, 1.05]) candidates.push({ velocity: [Math.sin(heading + angle) * speed * factor, Math.cos(heading + angle) * speed * factor], angle });
      let best: { score: number; velocity: Point2; prediction: Prediction } | undefined;
      for (const candidate of candidates) {
        const prediction = this.predict(body, candidate.velocity, env); let gap = Infinity, safe = true;
        for (let k = 1; k < prediction.length && safe; k++) {
          if (!domain.segmentClear(prediction[k - 1], prediction[k], radius + .4)) { safe = false; break; }
          for (let j = 0; j < forecasts.length; j++) if (j !== i) {
            const d = sweptSeparation(prediction[k - 1], prediction[k], forecasts[j][k - 1], forecasts[j][k]); gap = Math.min(gap, d - 2 * radius);
            if (d < 2 * radius + 1.2) { safe = false; break; }
          }
        }
        if (!safe) continue;
        const travelled: Point2 = [prediction.at(-1)![0] - body.state.position[0], prediction.at(-1)![1] - body.state.position[1]];
        const progress = travelled[0] * Math.sin(heading) + travelled[1] * Math.cos(heading);
        const score = -progress + .3 * distance(candidate.velocity, this.selected[i] ?? nominal[i]) + 2 / Math.max(.2, gap) + (candidate.angle > 0 ? .35 : 0);
        if (!best || score < best.score) best = { score, velocity: candidate.velocity, prediction };
      }
      if (!best) { forecasts[i] = this.predict(body, [0, 0], env); this.interventions++; return [0, 0]; }
      forecasts[i] = best.prediction;
      if (distance(best.velocity, nominal[i]) > .15) this.interventions++;
      return best.velocity;
    });
    return this.selected;
  }
}
