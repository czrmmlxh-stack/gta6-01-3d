// Chapter A — The Viper War, Act 2 (missions 10-12).
// The Vipers roll into Sunvale and Marla answers.

export const chapterA = [
  {
    name: 'Vipers in Town',
    kind: 'walk',
    reward: 1700,
    brief: "Marla: Vipers rolled into town. Walk down to the docks and count their crew — don't get spotted.",
    done: 'You counted the Vipers. Marla knows what she is up against.',
    target: { x: 600, z: -650 },
  },
  {
    name: 'Send a Message',
    kind: 'steal',
    reward: 1800,
    brief: "Marla: Jack one of their cars and bring it to my garage. Let them know whose town this is.",
    done: "Their car sits in Marla's garage. Message sent.",
    dropoff: { x: -400, z: 625 },
  },
  {
    name: 'The Drop',
    kind: 'deliver',
    reward: 2000,
    brief: "Marla: This shipment can't fall into Viper hands. Pick it up at the warehouse and run it to the safehouse.",
    done: 'The drop is safe. The Vipers got nothing.',
    pickup: { x: -700, z: 200 },
    dropoff: { x: -200, z: -700 },
  },
];
