// The studio's clock: when things happen in the scene, and the shots that film it. A shot is a
// camera on this clock (`from` seconds, for `duration`), so two shots can film the same moment
// from two angles and the story can cut between them. The story (src/stories/*.js) imports this
// file to put sounds on the same moments; scene.js poses everything from it.

// The moments the film is about. Name them and cue everything off them.
export const LIGHTS_UP = 0.4;  // the room comes up
export const PRESS = 12.0;     // the key goes down
export const WORK = 2.6;       // seconds the screen shows Working before Done

// Shot names are what the story's CUT uses. Camera poses live in scene.js (SHOT_POSE).
export const SHOTS = [
  { name: 'studio-open', from: 0, duration: 7 },
  { name: 'studio-top', from: 6, duration: 5 },
  { name: 'studio-close', from: 10, duration: 7 },
  { name: 'studio-wide', from: 14, duration: 8 },
];
