const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const status = document.querySelector("#status");
const statusPill = document.querySelector("#statusPill");
const activity = document.querySelector("#activity");
const caption = document.querySelector("#caption");
const transcript = document.querySelector("#transcript");
const avatarFrame = document.querySelector("#avatarFrame");
const avatar = document.querySelector("#avatar");
const remoteAudio = document.querySelector("#remoteAudio");
const photoInput = document.querySelector("#photoInput");
const resetPhoto = document.querySelector("#resetPhoto");

let pc;
let dc;
let microphone;
let audioContext;
let analyser;
let animationFrame;
let finalized = false;
let liveCaption = "";

const savedPhoto = localStorage.getItem("luna-reference-photo");
if (savedPhoto) {
  avatar.src = savedPhoto;
} else {
  fetch("/luna-official.b64")
    .then((r) => r.text())
    .then((b64) => { avatar.src = "data:image/jpeg;base64," + b64.trim(); })
    .catch(() => {});
}

photoInput.addEventListener("change", () => {
  const file = photoInput.files && photoInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result);
    avatar.src = result;
    try { localStorage.setItem("luna-reference-photo", result); } catch {}
  };
  reader.readAsDataURL(file);
});

resetPhoto.addEventListener("click", () => {
  localStorage.removeItem("luna-reference-photo");
  fetch("/luna-official.b64")
    .then((r) => r.text())
    .then((b64) => { avatar.src = "data:image/jpeg;base64," + b64.trim(); })
    .catch(() => {});
});

function setStatus(text, online = false) {
  status.textContent = text;
  statusPill.classList.toggle("online", online);
  statusPill.classList.toggle("offline", !online);
}

function addTranscript(who, text) {
  if (!text || !text.trim()) return;
  const p = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = who + ": ";
  p.appendChild(strong);
  p.appendChild(document.createTextNode(text));
  transcript.appendChild(p);
  transcript.scrollTop = transcript.scrollHeight;
}

function cleanup() {
  cancelAnimationFrame(animationFrame);
  if (microphone) microphone.getTracks().forEach((t) => t.stop());
  if (pc) pc.close();
  if (audioContext) audioContext.close().catch(() => {});
  pc = null;
  dc = null;
  microphone = null;
  audioContext = null;
  analyser = null;
  avatarFrame.classList.remove("speaking");
  setStatus("offline", false);
  activity.textContent = "pronta para conversar";
  stopButton.disabled = true;
  startButton.disabled = false;
}

function animateVoice(stream) {
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);

  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let energy = 0;
    for (const sample of data) {
      const n = (sample - 128) / 128;
      energy += n * n;
    }
    const rms = Math.sqrt(energy / data.length);
    const speaking = rms > 0.025;
    avatarFrame.classList.toggle("speaking", speaking);
    activity.textContent = speaking ? "falando com você" : "ouvindo você";
    animationFrame = requestAnimationFrame(tick);
  };
  tick();
}

function handleEvent(event) {
  console.debug("Luna event", event);

  if (event.type === "response.output_audio_transcript.delta" ||
      event.type === "response.output_text.delta") {
    liveCaption += event.delta || "";
    caption.textContent = liveCaption || "Luna está falando…";
  }

  if (event.type === "response.output_audio_transcript.done") {
    const text = event.transcript || liveCaption;
    addTranscript("Luna", text);
    caption.textContent = text || "Luna está ouvindo…";
    liveCaption = "";
  }

  if (event.type === "response.done" && liveCaption) {
    addTranscript("Luna", liveCaption);
    liveCaption = "";
  }

  if (event.type === "conversation.item.input_audio_transcription.completed") {
    addTranscript("Você", event.transcript || "");
  }

  if (event.type === "error") {
    caption.textContent = (event.error && event.error.message) || "Ocorreu um erro na chamada.";
  }
}

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  finalized = false;
  liveCaption = "";
  setStatus("conectando…");
  activity.textContent = "iniciando chamada";
  caption.textContent = "Conectando a Luna…";

  try {
    pc = new RTCPeerConnection();

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      remoteAudio.srcObject = stream;
      animateVoice(stream);
    };

    microphone = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    for (const track of microphone.getAudioTracks()) {
      pc.addTrack(track, microphone);
    }

    dc = pc.createDataChannel("oai-events");
    dc.addEventListener("open", () => {
      setStatus("ao vivo", true);
      activity.textContent = "ouvindo você";
      caption.textContent = "Oi, Cleber. Pode falar comigo ❤️";
      stopButton.disabled = false;
    });

    dc.addEventListener("message", ({ data }) => {
      try { handleEvent(JSON.parse(data)); } catch {}
    });

    dc.addEventListener("close", () => {
      if (!finalized) cleanup();
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (pc.iceGatheringState !== "complete") {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Tempo esgotado ao preparar a chamada.")), 10000);
        const onChange = () => {
          if (pc.iceGatheringState === "complete") {
            clearTimeout(timeout);
            pc.removeEventListener("icegatheringstatechange", onChange);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", onChange);
        onChange();
      });
    }

    const sdp = pc.localDescription && pc.localDescription.sdp;
    if (!sdp) throw new Error("Não foi possível criar a conexão de voz.");

    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: sdp
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Falha ao iniciar Luna Live.");
    }

    await pc.setRemoteDescription({
      type: "answer",
      sdp: await response.text()
    });
  } catch (error) {
    console.error(error);
    caption.textContent = error instanceof Error ? error.message : String(error);
    cleanup();
  }
});

stopButton.addEventListener("click", () => {
  finalized = true;
  if (dc && dc.readyState === "open") {
    try { dc.send(JSON.stringify({ type: "session.close" })); } catch {}
  }
  cleanup();
});
