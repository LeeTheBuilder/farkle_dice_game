(function (root, factory) {
  root.TavernMusic = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const AudioContextConstructor =
    typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);

  const MELODY = [
    293.66, 349.23, 440.0, 523.25, 440.0, 392.0, 349.23, 329.63,
    293.66, 220.0, 261.63, 293.66, 349.23, 392.0, 329.63, 293.66,
  ];
  const HARMONY = [146.83, 220.0, 261.63, 220.0, 174.61, 220.0, 196.0, 146.83];
  const DRUM_STEPS = new Set([0, 4, 7, 12]);
  const BPM = 84;
  const STEP_SECONDS = 60 / BPM / 2;
  const LOOKAHEAD_MS = 90;
  const SCHEDULE_AHEAD_SECONDS = 0.48;

  function createTavernMusic() {
    let context = null;
    let masterGain = null;
    let delay = null;
    let delayGain = null;
    let schedulerId = null;
    let nextStepTime = 0;
    let step = 0;
    let noiseBuffer = null;
    let playing = false;
    let droneNodes = [];
    let customAudio = null;
    let customSourceUrl = "";
    let customTrackName = "";

    function isSupported() {
      return Boolean(AudioContextConstructor || typeof Audio !== "undefined");
    }

    function isProceduralSupported() {
      return Boolean(AudioContextConstructor);
    }

    function ensureContext() {
      if (!isSupported()) {
        return null;
      }

      if (context) {
        return context;
      }

      context = new AudioContextConstructor();
      masterGain = context.createGain();
      masterGain.gain.value = 0;

      const softener = context.createBiquadFilter();
      softener.type = "lowpass";
      softener.frequency.value = 3600;
      softener.Q.value = 0.5;

      delay = context.createDelay(1.5);
      delay.delayTime.value = 0.34;
      delayGain = context.createGain();
      delayGain.gain.value = 0.16;

      delay.connect(delayGain);
      delayGain.connect(delay);
      delayGain.connect(softener);
      masterGain.connect(softener);
      softener.connect(context.destination);

      noiseBuffer = createNoiseBuffer(context);
      return context;
    }

    function createNoiseBuffer(audioContext) {
      const length = Math.floor(audioContext.sampleRate * 0.28);
      const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
      const data = buffer.getChannelData(0);

      for (let index = 0; index < length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / length);
      }

      return buffer;
    }

    function connectVoice(node, gainNode, delayAmount) {
      node.connect(gainNode);
      gainNode.connect(masterGain);

      if (delay && delayAmount > 0) {
        const send = context.createGain();
        send.gain.value = delayAmount;
        gainNode.connect(send);
        send.connect(delay);
      }
    }

    function playPluck(time, frequency, velocity, panValue) {
      const osc = context.createOscillator();
      const overtone = context.createOscillator();
      const body = context.createBiquadFilter();
      const amp = context.createGain();
      const pan = context.createStereoPanner ? context.createStereoPanner() : null;
      const startGain = Math.max(0.0001, velocity);

      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, time);
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.995, time + 0.38);

      overtone.type = "sine";
      overtone.frequency.setValueAtTime(frequency * 2.01, time);

      body.type = "lowpass";
      body.frequency.setValueAtTime(2600, time);
      body.frequency.exponentialRampToValueAtTime(900, time + 0.42);
      body.Q.value = 2.1;

      amp.gain.setValueAtTime(0.0001, time);
      amp.gain.exponentialRampToValueAtTime(startGain, time + 0.018);
      amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.72);

      osc.connect(body);
      overtone.connect(body);

      if (pan) {
        pan.pan.value = panValue;
        body.connect(pan);
        connectVoice(pan, amp, 0.3);
      } else {
        connectVoice(body, amp, 0.3);
      }

      osc.start(time);
      overtone.start(time);
      osc.stop(time + 0.82);
      overtone.stop(time + 0.82);
    }

    function playHarmony(time, frequency) {
      const osc = context.createOscillator();
      const amp = context.createGain();
      const filter = context.createBiquadFilter();

      osc.type = "sawtooth";
      osc.frequency.value = frequency;
      filter.type = "lowpass";
      filter.frequency.value = 1200;
      filter.Q.value = 0.7;

      amp.gain.setValueAtTime(0.0001, time);
      amp.gain.exponentialRampToValueAtTime(0.045, time + 0.04);
      amp.gain.exponentialRampToValueAtTime(0.0001, time + 1.25);

      osc.connect(filter);
      connectVoice(filter, amp, 0.2);
      osc.start(time);
      osc.stop(time + 1.35);
    }

    function playDrum(time) {
      const noise = context.createBufferSource();
      const noiseFilter = context.createBiquadFilter();
      const noiseAmp = context.createGain();
      const thump = context.createOscillator();
      const thumpAmp = context.createGain();

      noise.buffer = noiseBuffer;
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 180;
      noiseFilter.Q.value = 1.5;

      noiseAmp.gain.setValueAtTime(0.0001, time);
      noiseAmp.gain.exponentialRampToValueAtTime(0.09, time + 0.012);
      noiseAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

      thump.type = "sine";
      thump.frequency.setValueAtTime(92, time);
      thump.frequency.exponentialRampToValueAtTime(58, time + 0.16);
      thumpAmp.gain.setValueAtTime(0.0001, time);
      thumpAmp.gain.exponentialRampToValueAtTime(0.08, time + 0.012);
      thumpAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);

      noise.connect(noiseFilter);
      connectVoice(noiseFilter, noiseAmp, 0);
      connectVoice(thump, thumpAmp, 0);

      noise.start(time);
      thump.start(time);
      noise.stop(time + 0.22);
      thump.stop(time + 0.24);
    }

    function startDrone(now) {
      stopDrone(now);

      const root = context.createOscillator();
      const fifth = context.createOscillator();
      const rootGain = context.createGain();
      const fifthGain = context.createGain();
      const droneFilter = context.createBiquadFilter();

      root.type = "sawtooth";
      root.frequency.value = 73.42;
      fifth.type = "triangle";
      fifth.frequency.value = 110.0;

      rootGain.gain.setValueAtTime(0.0001, now);
      rootGain.gain.exponentialRampToValueAtTime(0.025, now + 0.8);
      fifthGain.gain.setValueAtTime(0.0001, now);
      fifthGain.gain.exponentialRampToValueAtTime(0.018, now + 0.8);

      droneFilter.type = "lowpass";
      droneFilter.frequency.value = 620;
      droneFilter.Q.value = 0.9;

      root.connect(rootGain);
      fifth.connect(fifthGain);
      rootGain.connect(droneFilter);
      fifthGain.connect(droneFilter);
      droneFilter.connect(masterGain);

      root.start(now);
      fifth.start(now);
      droneNodes = [root, fifth, rootGain, fifthGain];
    }

    function stopDrone(time) {
      if (!droneNodes.length) {
        return;
      }

      const [root, fifth, rootGain, fifthGain] = droneNodes;
      rootGain.gain.cancelScheduledValues(time);
      fifthGain.gain.cancelScheduledValues(time);
      rootGain.gain.setTargetAtTime(0.0001, time, 0.18);
      fifthGain.gain.setTargetAtTime(0.0001, time, 0.18);
      root.stop(time + 0.7);
      fifth.stop(time + 0.7);
      droneNodes = [];
    }

    function scheduleStep(time) {
      const melodyIndex = step % MELODY.length;
      const harmonyIndex = Math.floor(step / 4) % HARMONY.length;
      const phraseAccent = melodyIndex === 0 || melodyIndex === 8 ? 1.22 : 1;

      if (step % 2 === 0) {
        playPluck(time, MELODY[melodyIndex], 0.085 * phraseAccent, step % 4 === 0 ? -0.18 : 0.18);
      }

      if (step % 4 === 0) {
        playHarmony(time, HARMONY[harmonyIndex]);
      }

      if (DRUM_STEPS.has(step % 16)) {
        playDrum(time);
      }

      step += 1;
    }

    function scheduler() {
      while (nextStepTime < context.currentTime + SCHEDULE_AHEAD_SECONDS) {
        scheduleStep(nextStepTime);
        nextStepTime += STEP_SECONDS;
      }
    }

    async function start() {
      if (customAudio) {
        customAudio.currentTime = customAudio.ended ? 0 : customAudio.currentTime;
        customAudio.volume = 0.52;
        customAudio.loop = true;
        await customAudio.play();
        playing = true;
        return true;
      }

      const audioContext = ensureContext();
      if (!audioContext) {
        return false;
      }

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      if (playing) {
        return true;
      }

      const now = audioContext.currentTime;
      playing = true;
      step = 0;
      nextStepTime = now + 0.08;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value, 0.0001), now);
      masterGain.gain.exponentialRampToValueAtTime(0.32, now + 0.55);
      startDrone(now);
      scheduler();
      schedulerId = setInterval(scheduler, LOOKAHEAD_MS);
      return true;
    }

    function stop() {
      if (!playing) {
        return;
      }

      playing = false;

      if (customAudio) {
        customAudio.pause();
        return;
      }

      if (!context) {
        return;
      }

      const now = context.currentTime;
      clearInterval(schedulerId);
      schedulerId = null;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setTargetAtTime(0.0001, now, 0.25);
      stopDrone(now);
    }

    async function toggle() {
      if (playing) {
        stop();
        return false;
      }

      return start();
    }

    function setFile(file) {
      const wasPlaying = playing;
      stop();

      if (customSourceUrl) {
        URL.revokeObjectURL(customSourceUrl);
      }

      customSourceUrl = URL.createObjectURL(file);
      customTrackName = file.name || "Local track";
      customAudio = new Audio(customSourceUrl);
      customAudio.loop = true;
      customAudio.preload = "auto";
      customAudio.volume = 0.52;
      customAudio.addEventListener("ended", () => {
        playing = false;
      });

      if (wasPlaying) {
        return start();
      }

      return Promise.resolve(false);
    }

    function clearFile() {
      stop();

      if (customSourceUrl) {
        URL.revokeObjectURL(customSourceUrl);
      }

      customAudio = null;
      customSourceUrl = "";
      customTrackName = "";
    }

    function getSourceLabel() {
      return customTrackName || (isProceduralSupported() ? "Generated loop" : "No audio source");
    }

    return {
      clearFile,
      getSourceLabel,
      isPlaying: () => playing,
      isProceduralSupported,
      isSupported,
      setFile,
      start,
      stop,
      toggle,
    };
  }

  return {
    createTavernMusic,
  };
});
