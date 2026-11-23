// Chapter C — The Viper War, Act 3 (missions 15-16).
// The evidence burns and the Viper convoy gets hit.

export const chapterC = [
  {
    name: 'Burn the Evidence',
    kind: 'deliver',
    reward: 2800,
    brief: 'Marla: The rat stashed ledgers in the warehouse. Grab them and run them to the docks to burn.',
    done: 'The ledgers are ash. No paper trail.',
    pickup: { x: -700, z: 200 },
    dropoff: { x: 600, z: -650 },
  },
  {
    name: 'The Convoy',
    kind: 'steal',
    reward: 3000,
    brief: 'Marla: The Vipers run a convoy through town. Hijack one of their rides and take it to the chop shop.',
    done: 'Their convoy is one ride short. The chop shop pays well.',
    dropoff: { x: 600, z: 120 },
  },
];
