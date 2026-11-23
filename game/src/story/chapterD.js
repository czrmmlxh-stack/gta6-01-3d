// Sunvale 3D — Chapter D: "The Viper War", Act 3 finale (Missions 17-19).
// Same shape as the MISSIONS entries in config.js: {name, reward, kind, brief, done},
// with `stars` on the evade job. Marla runs the crew; the Vipers are done after this.

export const CHAPTER_D = [
  {
    name: 'No Way Out',
    reward: 3500,
    kind: 'evade',
    stars: 4,
    brief: 'Four stars and the whole city is after you — lose the heat or reach the hideout.',
    done: 'No Way Out survived  +$3500',
  },
  {
    name: 'The Nest',
    reward: 4000,
    kind: 'walk',
    brief: 'Walk to the abandoned casino and scout the Vipers\u2019 nest without raising the alarm.',
    done: 'The Nest scouted  +$4000',
  },
  {
    name: 'End of the Vipers',
    reward: 5000,
    kind: 'deliver',
    brief: 'Pick up the package on foot, deliver it to the casino marker to blow the Vipers\u2019 nest, then drive away — after this job, Sunvale is Marla\u2019s.',
    done: 'The Vipers are finished — Sunvale is Marla\u2019s now  +$5000',
  },
];
