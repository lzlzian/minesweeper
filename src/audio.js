// ============================================================
// AUDIO
// ============================================================

const SFX_VOLUME = 0.5;
const BGM_VOLUME = 0.15;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sfxGain = audioCtx.createGain();
sfxGain.gain.value = SFX_VOLUME;
sfxGain.connect(audioCtx.destination);

const sfxBuffers = {};
const sfxPaths = {
  dig: 'assets/sounds/dig.mp3',
  boom: 'assets/sounds/boom.mp3',
  gold: 'assets/sounds/gold.mp3',
  step: 'assets/sounds/step.mp3',
  mark: 'assets/sounds/mark.mp3',
  unmark: 'assets/sounds/unmark.mp3',
  win: 'assets/sounds/win.mp3',
  welcome: 'assets/sounds/welcome.mp3',
  payment: 'assets/sounds/payment.mp3',
  scan: 'assets/sounds/scan.mp3',
  drink: 'assets/sounds/drink.mp3',
  pickaxe: 'assets/sounds/pickaxe.mp3',
  pickup: 'assets/sounds/pickup.mp3',
  click: 'assets/sounds/click.mp3',
  artifact_choice: 'assets/sounds/artifact_choice.mp3',
  card_flip: 'assets/sounds/card_flip.mp3',
  cash_register: 'assets/sounds/cash_register.mp3',
  crystal: 'assets/sounds/crystal.mp3',
  paper_tear: 'assets/sounds/paper_tear.mp3',
  pen_scratch: 'assets/sounds/pen_scratch.mp3',
  reward_unlock: 'assets/sounds/reward_unlock.mp3',
  stamp: 'assets/sounds/stamp.mp3',
};

for (const [name, path] of Object.entries(sfxPaths)) {
  fetch(path)
    .then(r => r.arrayBuffer())
    .then(buf => audioCtx.decodeAudioData(buf))
    .then(decoded => { sfxBuffers[name] = decoded; })
    .catch(err => console.warn(`SFX load failed: ${name} (${path})`, err));
}

let sfxEnabled = true;
let musicEnabled = true;

export function resumeAudioCtx() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

export function playSfx(name) {
  if (!sfxEnabled) return;
  const buf = sfxBuffers[name];
  if (!buf) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(sfxGain);
  src.start();
}

const bgm = new Audio('assets/sounds/background-music.mp3');
bgm.loop = true;
bgm.volume = BGM_VOLUME;

export function startBgm() {
  if (!musicEnabled) return;
  bgm.play().catch(() => {});
}

export function setMusicOn(value) {
  musicEnabled = value;
  if (value) {
    bgm.play().catch(() => {});
  } else {
    bgm.pause();
  }
}

export function setSfxOn(value) {
  sfxEnabled = value;
}
