"use strict";
function frameLoop() {
  requestAnimationFrame(frameLoop);
  try {
  if (UI.screen === 'tuner') Tuner.draw();
  if (UI.screen === 'piano') { Piano.draw(); Spec.draw(); }
  if (Keys.on) Keys.draw();
  if (UI.screen === 'settings') UI.tickLevel();
  if (UI.screen === 'seq') {
    /* While nothing moves and nobody is touching the screen the editor redraws a few times a second, which leaves the processor to the audio. */
    const busy = Seq.playing || Ed.drag || Rec.state !== 'idle' || performance.now() - UI.lastIn < 600; frameLoop.n = (frameLoop.n || 0) + 1;
    if (busy || frameLoop.n % 5 === 0) { Seq.draw(); Ed.draw(); Steps.draw(); Vox.draw(); Meta.draw(); Mark.draw(); }
    Seq.meters(); if (busy || frameLoop.n % 5 === 0) Seq.sliders();
  }
  } catch (e) { console.error(e); }
}

