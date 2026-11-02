"use strict";
/* ---- Wiring ---- */
function bind() {
  $$('#nav button').forEach(b => b.onclick = () => UI.show(b.dataset.s));
  $$('#menuDiff button').forEach(b => b.onclick = () => { Store.data.settings.diff = b.dataset.d; Store.save(); UI.refresh(); });
  const set = (id, key, get) => $(id).onchange = $(id).oninput = e => { Store.data.settings[key] = get(e.target); Store.save(); Engine.applySettings(); if (key === 'gateDb') UI.refresh(); };
  set('#setDiff', 'diff', e => e.value); set('#setHear', 'hear', e => e.checked); set('#setDrone', 'drone', e => e.checked);
  set('#setCues', 'cues', e => e.checked); set('#setWait', 'wait', e => e.checked); set('#setFind', 'find', e => +e.value); set('#setGuide', 'guide', e => e.value); set('#setVol', 'vol', e => +e.value);
  const vz = $('#volZone'), vp = $('#volPop'); let vHide = 0;
  const setVolFrom = x => { const v = Math.round(clamp(x / innerWidth, 0, 1) * 20) / 20, st = Store.data.settings; st.vol = clamp(v, 0.1, 1); $('#setVol').value = st.vol; $('#volFill').style.width = (st.vol - 0.1) / 0.9 * 100 + '%'; $('#volNum').textContent = Math.round(st.vol * 100) + '%'; Engine.applySettings(); };
  vz.ondragstart = vz.onselectstart = vz.oncontextmenu = vz.onmousedown = e => e.preventDefault();
  vz.onpointerdown = e => { e.preventDefault(); getSelection().removeAllRanges(); vz.setPointerCapture(e.pointerId); clearTimeout(vHide); vp.hidden = false; setVolFrom(e.clientX); };
  vz.onpointermove = e => { if (vz.hasPointerCapture(e.pointerId)) setVolFrom(e.clientX); };
  vz.onpointerup = vz.onpointercancel = () => { Store.save(); vHide = setTimeout(() => { vp.hidden = true; }, 400); };
  $('#setUi').onchange = e => { Store.data.settings.uiSize = e.target.value; Store.save(); applyUiSize(); };
  $('#setTimbre').innerHTML = timbreOptions() + '<option value="sf" id="sfOpt" hidden>SoundFont</option>';
  set('#setInst', 'inst', e => e.value); set('#setKbPlay', 'kbPlay', e => e.checked); set('#setTimbre', 'timbre', e => e.value); $$('.fxRv').forEach(el => el.onchange = e => { e.target.blur(); Store.data.settings.reverb = e.target.value; Knobs.free('reverb'); Store.save(); Engine.applySettings(); $$('.fxRv').forEach(x => x.value = e.target.value); });
  $$('.fxCh').forEach(el => el.onchange = e => { e.target.blur(); Store.data.settings.chorus = e.target.checked; Knobs.free('chorus'); Store.save(); Engine.applySettings(); $$('.fxCh').forEach(x => x.checked = e.target.checked); }); set('#setKb', 'kbSound', e => e.checked);
  $('#setMic').onchange = async e => { Store.data.settings.micId = e.target.value; Store.save(); try { await Engine.setMic(e.target.value); toast('Microphone changed.'); } catch (err) { toast(micMessage(err)); } };
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', () => Engine.listMics());
  $('#setTimbre').addEventListener('change', () => SFUI.list());
  $$('[data-fx]').forEach(el => el.onchange = e => { const k = el.dataset.fx; Store.data.settings[k] = el.type === 'checkbox' ? el.checked : el.value; Knobs.free({ fxTrem: 'trem', fxVib: 'vib', fxDelay: 'echo', fxWide: 'wide', fxTone: 'tone', fxPhase: 'phase', fxDrive: 'drive' }[k]); Store.save(); Engine.setFx(); if (el.tagName === 'SELECT') el.blur(); });
  $('#fxSus').onchange = e => VKeys.setPedal(e.target.checked);
  /* One button: switches every effect off, and brings the previous settings back on the second press. */
  const FX_KEYS = ['reverb', 'chorus', 'fxTrem', 'fxVib', 'fxDelay', 'fxWide', 'fxTone', 'fxPhase', 'fxDrive', 'fxOct', 'fxHuman'];
  let fxSaved = null;
  $('#fxReset').onclick = () => {
    const st = Store.data.settings, from = fxSaved || FX_KEYS.reduce((o, k) => (o[k] = DEFAULTS[k], o), {});
    if (!fxSaved) fxSaved = FX_KEYS.reduce((o, k) => (o[k] = st[k], o), {});
    else fxSaved = null;
    FX_KEYS.forEach(k => { st[k] = from[k]; });
    $$('.fxRv').forEach(x => x.value = st.reverb); $$('.fxCh').forEach(x => x.checked = !!st.chorus);
    $$('[data-fx]').forEach(el => { const v = st[el.dataset.fx]; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; });
    st.fxK = {}; Knobs.sync(); Store.save(); Engine.applySettings(); Engine.setFx();
    $('#fxReset').textContent = fxSaved ? '\u21ba Restore effects' : '\u21ba Reset all effects';
  };
  $('#setInst').addEventListener('change', e => Spec.setMode(instMode(e.target.value)));
  $$('#instSeg button').forEach(b => b.onclick = () => setInst(b.dataset.i));
  { const pop = $('#sqSavePop'), mb = $('#sqSaveMenu'), close = () => { pop.hidden = true; mb.setAttribute('aria-expanded', 'false'); };
    mb.onclick = e => { e.stopPropagation(); pop.hidden = !pop.hidden; mb.setAttribute('aria-expanded', String(!pop.hidden)); };
    pop.onclick = close; document.addEventListener('click', close); document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }); }
  { const menus = $$('#sqEdit [data-menu]'), closeAll = except => menus.forEach(m => { if (m === except) return; const p = m.querySelector('.dawpop'); p.hidden = true; m.querySelector('button').setAttribute('aria-expanded', 'false'); });
    menus.forEach(m => { const b = m.querySelector('button'), p = m.querySelector('.dawpop');
      b.onclick = e => { e.stopPropagation(); closeAll(m); p.hidden = !p.hidden; b.setAttribute('aria-expanded', String(!p.hidden)); p.style.left = '0'; p.style.right = 'auto';
        if (!p.hidden) { const r = p.getBoundingClientRect(); if (r.right > innerWidth - 4) { p.style.left = 'auto'; p.style.right = '0'; } } };
      p.onclick = e => e.stopPropagation(); });
    document.addEventListener('click', () => closeAll(null)); document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(null); }); }
  document.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', e => { const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find(x => /\.midi?$/i.test(x.name)); e.preventDefault(); if (!f) return; if ($('#o-start').classList.contains('on')) return toast('Start the app first, then drop the file.', 2500); UI.show('seq'); Seq.loadFile(f); });
  $('#sqSave').onclick = () => Seq.exportMid(); $('#sqWav').onclick = () => Seq.exportWav(); $('#sqMp3').onclick = () => Seq.exportWav('mp3'); $('#sqLoad').onclick = () => Seq.projects(); $('#pjImport').onclick = () => { $('#o-proj').classList.remove('on'); $('#sqFile').click(); }; $('#pjNew').onclick = () => { $('#o-proj').classList.remove('on'); Ed.newSong(); }; $('#pjClose').onclick = () => $('#o-proj').classList.remove('on'); $('#sqFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) Seq.loadFile(f); };
  $('#sqPlay').onclick = () => { if (Rec.state !== 'idle') Rec.stop(); else Seq.toggle(); }; $('#sqStop').onclick = () => { if (Rec.state !== 'idle') Rec.stop(); else Seq.stop(); };      // during a take both end the take, as the space bar does $('#sqRew').onclick = () => Seq.seek(0);
  const fsOk = !!document.documentElement.requestFullscreen, standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
  if (standalone) $('#btnFs').closest('.setting').hidden = true;
  else if (!fsOk) { $('#btnFs').hidden = true; $('#fsHint').textContent = 'This browser cannot hide its address bar. Use Share, then Add to Home Screen, and open Pitch Perfect from there.'; }
  $('#btnFs').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); try { await screen.orientation.unlock(); } catch (e) {} } } catch (e) { toast('Full screen was refused by the browser.'); } };
  document.addEventListener('fullscreenchange', () => { $('#btnFs').textContent = document.fullscreenElement ? '⛶ Exit full screen' : '⛶ Full screen'; });
  const sideOff = (() => { try { return localStorage.getItem('pp-seq-side') === 'off'; } catch (e) { return false; } })();
  const showSide = on => { $('#sqBody').classList.toggle('noside', !on); $('#sqSide').classList.toggle('on', on); $('#sqSide').setAttribute('aria-pressed', on); try { localStorage.setItem('pp-seq-side', on ? 'on' : 'off'); } catch (e) {} };
  showSide(!sideOff);
  $('#sqSide').onclick = () => showSide($('#sqBody').classList.contains('noside'));
  /* Focus mode: hides the bottom navigation, the song and file controls and the tracks panel, so the editor and the timeline get the screen. */
  const setFocus = on => { document.body.classList.toggle('focus', on); $('#sqFull').textContent = on ? '✕ Exit focus' : '⛶ Focus'; $('#sqFull').classList.toggle('on', on); if (UI.screen === 'seq') Seq.render(); };
  $('#sqFull').onclick = () => setFocus(!document.body.classList.contains('focus'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('focus')) setFocus(false); });
  $('#sqLoop').title = 'Repeat the song, or the region you drag in the strip above the tracks'; $('#sqLoop').onclick = e => { Seq.loop = !Seq.loop; e.currentTarget.classList.toggle('on', Seq.loop); Seq.save(); };
  $('#sqTempo').oninput = e => { $('#sqTempoOut').textContent = e.target.value + '%'; }; $('#sqTempo').onchange = e => Seq.setTempo(e.target.value / 100);
  { const cv = $('#seqCv'); cv.onpointerdown = e => Seq.ovDown(e); cv.onpointermove = e => Seq.ovMove(e); cv.onpointerup = () => Seq.ovUp(); cv.onpointercancel = () => { Seq.ovDrag = null; Seq.ovMode = null; Seq.ovReg = null; }; }
  $('#sqSeek').oninput = e => { Seq.drag = true; $('#sqTime').textContent = Seq.fmt(+e.target.value) + ' / ' + Seq.fmt(Seq.length); }; $('#sqSeek').onchange = e => { Seq.drag = false; Seq.seek(+e.target.value); };
  Ed.init(); Knobs.init(); Vox.init(); $('#sqAcc').checked = Store.data.settings.seqAcc !== false; $('#sqAcc').onchange = e => { Store.data.settings.seqAcc = e.target.checked; Store.save(); };
  for (let o = 1; o <= 7; o++) { const d = document.createElement('div'); d.className = 'ppoct'; d.innerHTML = '<b>' + o + '</b><div class="ppn">' + [...'CDEFGAB'].map(l => '<i>' + l + '</i>').join('') + '</div>'; $('#ppOcts').appendChild(d); }
  $('#instHintBtn').onclick = () => { if (Tuner.hint.want) setInst(Tuner.hint.want); $('#instHint').hidden = true; };
  $('#instHintNo').onclick = () => { Tuner.hint.dismissed[Tuner.hint.want] = true; $('#instHint').hidden = true; };
  $$('#specFft button').forEach(b => b.onclick = () => { Store.data.settings.fft = b.dataset.f; Store.save(); Spec.applyFft(); Spec.key = ''; });
  $('#specFull').onclick = () => Spec.openFull(); $('#specClose').onclick = () => Spec.closeFull();
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) Spec.closeFull(); });
  $('#specSynth').onchange = e => { Store.data.settings.specSynth = e.target.checked; Store.save(); };
  $('#specLine').onchange = e => { Store.data.settings.specLine = e.target.checked; Store.save(); };
  $('#btnMidiConn').onclick = async () => { const ok = await Midi.connect(true); if (!ok) toast(Midi.lastMsg, 8000); };
  set('#setA4', 'a4', e => clamp(+e.value || 440, 415, 466)); set('#setGate', 'gateDb', e => +e.value);
  VKeys.attach($('#pianoCv')); VKeys.attach($('#specCv')); VKeys.attach($('#pxCv')); VKeys.attach($('#kyCv'));
  document.addEventListener('keydown', e => VKeys.onKey(e, true)); document.addEventListener('keyup', e => VKeys.onKey(e, false));
  window.addEventListener('blur', () => VKeys.releaseAll());
  $('#btnPlayKeys').onclick = () => Keys.open(); $('#kyClose').onclick = () => Keys.close(); $('#btnRelease').onclick = () => { VKeys.releaseAll(); toast('All keys released.', 1200); };
  $('#kyDown').onclick = () => Keys.shift(-1); $('#kyUp').onclick = () => Keys.shift(1); $('#kySpan').onchange = e => { Keys.span = +e.target.value; Keys.fit(); };
  $('#kyPedal').onclick = () => VKeys.setPedal(!VKeys.pedal);
  $('#sfLoadDir').onclick = () => $('#sfDir').click(); $('#sfDir').onchange = e => { const f = [...e.target.files]; e.target.value = ''; SFUI.onDir(f); };
  SFMgr.init();
  $$('.sfQuickPre').forEach(el => el.onchange = e => { e.target.blur(); SFUI.prepare(+e.target.value); });
  $$('.sfQuick').forEach(el => el.onchange = e => { e.target.blur(); if (e.target.value === '\u0001dir') { SFUI.list(); $('#sfDir').click(); } else SFUI.pick(e.target.value); });
  SFUI.list();
  $('#sfLoad').onclick = () => $('#sfFile').click(); $('#sfFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; SFUI.onFile(f); };
  $('#sfRemove').onclick = () => SFUI.remove(); $('#sfTry').onclick = () => SFUI.tryIt(); $('#sfPreset').onchange = e => SFUI.prepare(+e.target.value);
  $('#libSearch').oninput = e => { Lib.f.q = e.target.value; Lib.render(); };
  $('#libLevel').onchange = e => { Lib.f.level = +e.target.value; Lib.render(); }; $('#libCat').onchange = e => { Lib.f.cat = e.target.value; Lib.render(); };
  $('#libFav').onclick = () => { Lib.f.fav = !Lib.f.fav; Lib.render(); };
  $$('#trMode button').forEach(b => b.onclick = () => {
    const m = b.dataset.m, st = Store.data.settings; st.trainMode = m === 'piano' ? 'piano' : 'sing'; Store.save();
    if (m === 'sing' && st.inst !== 'voice') setInst('voice'); else if (m === 'whistle' && st.inst !== 'whistle') setInst('whistle'); else UI.refresh();
  });
  $$('#prView button').forEach(b => b.onclick = () => { Store.data.settings.prView = b.dataset.v; Store.save(); UI.refresh(); });
  $('#sStop').onclick = () => Session.stop();
  $('#btnMidi').onclick = () => $('#midiFile').click();
  $('#midiFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadMidiFile(f); };
  $('#midiTrack').onchange = e => useMidiUnit(+e.target.value);
  $('#sqSingIt').onclick = () => {
    if (Seq.sing < 0) { const k = Seq.tracks.findIndex(t => t.ti === Ed.ti && !t.drums); if (k < 0) return toast('Select a melody track, or press SING on one, first.', 3000); Seq.setSing(k); if (Seq.sing < 0) return; }
    Seq.stop(); UI.show('train'); UI.lastExercise = 'midi'; Session.begin('midi');
  };
  $('#btnMidiPlay').onclick = () => { UI.lastExercise = 'midi'; Session.begin('midi'); };
  document.addEventListener('keydown', e => {
    if (!Session.s || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || $('#o-start').classList.contains('on')) return;
    const k = { ArrowLeft: () => Session.seek(-1), ArrowRight: () => Session.seek(1), ArrowUp: () => Session.setTempo(5), ArrowDown: () => Session.setTempo(-5) }[e.code];
    if (k) { e.preventDefault(); k(); }
  });
  document.addEventListener('keydown', e => {
    if ((UI.screen !== 'tuner' && UI.screen !== 'piano') || Session.s || Keys.on || PX.on || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || $('#o-start').classList.contains('on')) return;
    const k = { ArrowUp: () => SFUI.stepFont(-1), ArrowDown: () => SFUI.stepFont(1), ArrowLeft: () => SFUI.stepPreset(-1), ArrowRight: () => SFUI.stepPreset(1) }[e.code];
    if (k) { e.preventDefault(); k(); }
  });
  $('#sPrev').onclick = () => Session.seek(-1); $('#sNext').onclick = () => Session.seek(1); $('#sSlow').onclick = () => Session.setTempo(-5); $('#sFast').onclick = () => Session.setTempo(5);
  $('#tmMinus').onclick = () => Session.setTempo(-5); $('#tmPlus').onclick = () => Session.setTempo(5);
  $('#setTempo').oninput = e => { Store.data.settings.tempo = +e.target.value; Store.save(); $('#tempoVal').textContent = e.target.value + '%'; $('#tmVal').textContent = e.target.value + '%'; };
  document.addEventListener('keydown', e => {
    const tg = e.target, typing = tg.tagName === 'TEXTAREA' || tg.isContentEditable || (tg.tagName === 'INPUT' && /^(text|search|number|email|url|password|tel)$/.test(tg.type)),
      picker = UI.screen === 'seq' && (tg.tagName === 'SELECT' || (tg.tagName === 'INPUT' && !typing));      // in the Composer a focused dropdown, slider or checkbox must not swallow the space bar
    if (e.code !== 'Space' || typing || (!picker && /^(INPUT|SELECT)$/.test(tg.tagName)) || Keys.on || PX.on) return;
    if ($('#o-start').classList.contains('on')) return;
    e.preventDefault(); if (e.repeat) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (RangeFinder.active) { RangeFinder.best[RangeFinder.step] = null; RangeFinder.buf = []; RangeFinder.render(); toast('Reset. Sing again.', 1500); }
    else if (Session.s) Session.restart();
    else if (UI.screen === 'train' && !$('#tr-res').hidden && UI.lastExercise) Session.begin(UI.lastExercise);
    else if (UI.screen === 'seq' && !$('.overlay.on')) { if (Rec.state !== 'idle') Rec.stop(); else Seq.toggle(); }
  });
  $('#rAgain').onclick = () => Session.begin(UI.lastExercise);
  $('#rBack').onclick = () => Routine.active ? Routine.abort() : UI.trainView('menu');
  const openRange = () => { RangeFinder.open(Store.data.settings.inst === 'whistle'); };
  const findRange = w => { const want = w ? 'whistle' : 'voice'; if (Store.data.settings.inst !== want) setInst(want); RangeFinder.open(w); };
  $('#btnFindWhistle').onclick = $('#tuRangeWhistle').onclick = () => findRange(true); $('#tuRangeSing').onclick = () => findRange(false);
  Midi.onNote = n => Guide.onKey(n);
  $('#btnEcho').onclick = async () => {
    if (!(await Midi.connect(true))) { toast(Midi.lastMsg, 8000); return; }
    if (!Midi.inputCount()) { toast('No keyboard found. Plug it into the USB TO HOST port, switch the piano on and try again.', 5000); return; }
    Guide.openEcho();
  };
  $('#btnGuide').onclick = () => Guide.open(); $('#gClose').onclick = () => { Guide.close(); if (Routine.active) Routine.abort('Routine stopped'); };
  PXS.forEach(d => { const b = document.createElement('button'); b.className = 'card'; b.innerHTML = '<div class="t"></div><div class="muted small"></div>'; b.children[0].textContent = d.name; b.children[1].textContent = d.desc; b.onclick = () => PX.open(d.id); $('#pxList').appendChild(b); });
  $('#pxClose').onclick = () => PX.close(); $('#pxHear').onclick = () => PX.hear(); $('#pxSkip').onclick = () => PX.skip();
  ['#pxKey', '#pxO1', '#pxO2'].forEach(id => $(id).onchange = () => PX.start());
  $('#pxShow').onchange = e => { Store.data.settings.pxShow = e.target.checked; Store.save(); }; $('#pxAny').onchange = e => { Store.data.settings.pxAny = e.target.checked; Store.save(); };
  $('#rbClose').onclick = () => Builder.close(); $('#rbSave').onclick = () => Builder.save(); $('#rbDel').onclick = () => Builder.del();
  $('#rbAddBtn').onclick = () => { Builder.cur.steps.push($('#rbAdd').value); Builder.render(); };
  $('#rtClose').onclick = () => Routine.abort('Routine stopped'); $('#rtSkip').onclick = () => Routine.next(); $('#rtDone').onclick = () => Routine.next();
  $('#rNext').onclick = () => Routine.next();
  $('#gBack').onclick = () => Guide.go(Guide.done ? 0 : Guide.i - 1); $('#gSkip').onclick = () => { Guide.skips++; Guide.go(Guide.i + 1); }; $('#gHear').onclick = () => Guide.hear();
  $('#gRoot').onchange = e => { Store.data.settings.guideRoot = e.target.value; Store.save(); Guide.root = Guide.pickRoot(); Guide.go(Guide.i >= 8 ? 0 : Guide.i); };
  $('#gNames').onchange = e => { Store.data.settings.guideNames = e.target.value; Store.save(); Guide.go(Guide.i); };
  $('#gFirst').onchange = e => { Store.data.settings.guideFirst = e.target.checked; Store.save(); };
  $('#btnFindRange').onclick = openRange; $('#btnFindRange2').onclick = openRange;
  document.querySelectorAll('#specRange button').forEach(b => b.onclick = () => Spec.setMode(b.dataset.r));
  $('#rgNext').onclick = () => RangeFinder.next();
  $('#rgSkip').onclick = () => { RangeFinder.close(); };
  $('#btnWipe').onclick = async () => {
    if (!confirm('Delete your range, scores and recordings from this device?')) return;
    Store.wipe(); Store.data = { settings: Object.assign({}, DEFAULTS), range: null, rangeLog: [], history: [], passes: {} };
    try { await Takes.clear(); } catch (e) {}
    Engine.applySettings(); UI.refresh(); toast('Data deleted.');
  };
  $('#btnStart').onclick = async () => {
    const err = $('#startErr'); err.hidden = true;
    if (matchMedia('(pointer: coarse)').matches && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});      // phones and tablets only; the tap is the gesture the browser needs
    try { await Engine.start(); } catch (e) { err.textContent = e.message; err.hidden = false; return; }
    SFUI.restore(); Seq.restore(); Engine.listMics(); Spec.setMode(instMode(Store.data.settings.inst)); $('#specLine').checked = Store.data.settings.specLine !== false; $('#specSynth').checked = Store.data.settings.specSynth !== false;
    if (Store.data.settings.midiOn) Midi.connect(false);
    Engine.listeners.add(f => Tuner.onFrame(f)); Engine.listeners.add(f => RangeFinder.onFrame(f)); Engine.listeners.add(f => Guide.onFrame(f)); Engine.listeners.add(f => Routine.onFrame(f));
    $('#o-start').classList.remove('on');
    if (!Store.data.range) RangeFinder.open();
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && Session.s) { Session.stop(); toast('Exercise stopped because the app went to the background.'); } });
  window.addEventListener('resize', () => { if (UI.screen === 'progress') UI.drawChart(); });
}

['pointerdown', 'pointermove', 'keydown', 'wheel', 'input', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { UI.lastIn = performance.now(); }, { passive: true, capture: true }));
Store.load();
applyUiSize();
bind();
Steps.init(); Meta.init(); Mark.init();
UI.refresh();
frameLoop();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
