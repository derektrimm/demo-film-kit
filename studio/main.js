// The studio: the stage (stage.js) filming the product scene (scene.js) on its clock (events.js).
import { createStage } from './stage.js';
import * as SCENE from './scene.js';
import { SHOTS } from './events.js';

createStage({ scene: SCENE, shots: SHOTS });
