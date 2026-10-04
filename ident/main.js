// The logo ident: the stage filming the logo scene, with the name and the closing card's words
// drawn over it. Shots: "intro" and "outro" (render them as separate takes with --only).
import { createStage } from '../studio/stage.js';
import * as SCENE from './scene.js';
import { IDENT } from './config.js';
import { INTRO, OUTRO, NAME, CARD } from './beats.js';
import { win, easeOut, smooth } from '../src/util.js';

const $ = (id) => document.getElementById(id);
$('name').textContent = IDENT.name;
document.querySelector('#card .studio').textContent = IDENT.name;
document.querySelector('#card .title').textContent = IDENT.title;
document.querySelector('#card .tag').textContent = IDENT.tag;
$('fine').textContent = IDENT.fine ?? '';

createStage({
  scene: SCENE,
  // The intro and the closing card are separate clocks; the scene reads which from ctx.shot.
  shots: [{ name: 'intro', from: 0, duration: INTRO }, { name: 'outro', from: 0, duration: OUTRO }],
  overlay: (shot, t) => {
    const outro = shot.name === 'outro';
    $('name').style.opacity = outro ? '0' : win(t, NAME.t0, NAME.t1, 0.6, 0.6).toFixed(4);
    $('name').style.letterSpacing = `${(0.52 + (1 - easeOut((t - NAME.t0) / 2)) * 0.2).toFixed(4)}em`;
    const card = outro ? smooth((t - CARD) / 1.0) : 0;
    $('card').style.opacity = card.toFixed(4);
    $('card').style.transform = `translateY(${((1 - easeOut((t - CARD) / 1.4)) * 18).toFixed(2)}px)`;
    $('fine').style.opacity = (outro ? smooth((t - CARD - 0.8) / 1.0) : 0).toFixed(4);
  },
});
