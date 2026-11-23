// Chapter D — The Viper War, Act 3 finale (missions 17-19).
// A four-star manhunt, the nest gets cased, and the Vipers fall.

export const chapterD = [
  {
    name: 'No Way Out',
    kind: 'evade',
    reward: 3500,
    stars: 4,
    brief: 'Marla: Every cop in Sunvale is looking for you. Four stars. Lose them and get to the safehouse.',
    done: 'Four stars and you walked away. Legend.',
    hideout: { x: -200, z: -700 },
  },
  {
    name: 'The Nest',
    kind: 'walk',
    reward: 4000,
    brief: "Marla: The Vipers' nest is the abandoned casino. Walk over and case it — don't spook them.",
    done: 'You cased the nest. Marla has the full picture.',
    target: { x: 680, z: 600 },
  },
  {
    name: 'End of the Vipers',
    kind: 'deliver',
    reward: 5000,
    brief: 'Marla: Last job. Carry this package into the casino, light up their nest, and drive away. After this, Sunvale is ours.',
    done: 'The Vipers are finished. Sunvale belongs to Marla — and to you.',
    pickup: { x: 200, z: -300 },
    dropoff: { x: 680, z: 600 },
  },
];
