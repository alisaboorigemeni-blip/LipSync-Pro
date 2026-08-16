const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const encodeWAV = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  floatTo16BitPCM(view, 44, samples);

  return buffer;
};

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'TRIM_SILENCE') {
    const { channelData, sampleRate } = payload as { channelData: Float32Array, sampleRate: number };
    const threshold = 0.02;

    let start = -1;
    let end = -1;

    for (let i = 0; i < channelData.length; i++) {
      if (Math.abs(channelData[i]) > threshold) {
        start = i;
        break;
      }
    }

    if (start === -1) {
      self.postMessage({ type: 'TRIM_SILENCE_RESULT', payload: null });
      return;
    }

    for (let i = channelData.length - 1; i >= 0; i--) {
      if (Math.abs(channelData[i]) > threshold) {
        end = i + 1;
        break;
      }
    }

    const padding = Math.floor(sampleRate * 0.1);
    start = Math.max(0, start - padding);
    end = Math.min(channelData.length, end + padding);

    const length = end - start;
    if (length < sampleRate * 0.2) {
      self.postMessage({ type: 'TRIM_SILENCE_RESULT', payload: null });
      return;
    }

    const slicedData = channelData.slice(start, end);
    const wavBuffer = encodeWAV(slicedData, sampleRate);
    
    // Transfer the array buffer back
    self.postMessage({ type: 'TRIM_SILENCE_RESULT', payload: wavBuffer }, [wavBuffer]);
  }
};
