// Decode the audio track of a video/audio Blob in the browser and produce 16 kHz mono WAV chunks.
// Limits: decodeAudioData loads the whole file into RAM and needs a codec the browser supports.

export function encodeWavMono16(samples, sampleRate = 16000) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export async function decodeToMono16k(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || !window.OfflineAudioContext) throw new Error('Trình duyệt không hỗ trợ Web Audio API.');
  let decoded;
  const ctx = new AC();
  try {
    const arr = await blob.arrayBuffer();
    decoded = await ctx.decodeAudioData(arr);
  } catch (e) {
    throw new Error('Không giải mã được âm thanh (không có track âm thanh, codec không hỗ trợ, hoặc tệp quá lớn cho RAM).');
  } finally { ctx.close?.(); }
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const src = off.createBufferSource();
  src.buffer = decoded; src.connect(off.destination); src.start();
  const rendered = await off.startRendering();
  const data = rendered.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i += 97) peak = Math.max(peak, Math.abs(data[i]));
  return { samples: data, sampleRate: rate, duration: decoded.duration, silent: peak < 0.001 };
}

export function chunkWav({ samples, sampleRate }, chunkSeconds = 300) {
  const size = chunkSeconds * sampleRate, out = [];
  for (let i = 0; i < samples.length; i += size) {
    out.push({ offset: i / sampleRate, blob: encodeWavMono16(samples.subarray(i, i + size), sampleRate) });
  }
  return out;
}
