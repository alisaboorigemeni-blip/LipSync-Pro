
export interface VideoRecorder {
  start: () => Promise<void>;
  stop: () => Promise<Blob>;
  getAudioContext: () => AudioContext;
}

export const createVideoRecorder = (
  canvas: HTMLCanvasElement,
  audioBuffer: AudioBuffer
): VideoRecorder => {
  const fps = 60;
  // Create a dedicated AudioContext for the recording session
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const dest = ctx.createMediaStreamDestination();
  
  // Create the source node for the audio
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  
  // CONNECT ONLY TO RECORDER, NOT SPEAKERS
  // source.connect(ctx.destination); // <-- REMOVED THIS LINE
  source.connect(dest);

  // Capture video stream from canvas
  // @ts-ignore - captureStream exists on standard HTMLCanvasElement
  const canvasStream = canvas.captureStream(fps) as MediaStream;
  
  // Combine tracks: Video from Canvas + Audio from AudioContext Destination
  const combinedTracks = [
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks()
  ];
  const combinedStream = new MediaStream(combinedTracks);

  // Setup MediaRecorder
  // Prefer VP9 for better quality, fallback to standard webm
  const mimeTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  
  let selectedMimeType = 'video/webm';
  for (const type of mimeTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      selectedMimeType = type;
      break;
    }
  }

  const recorder = new MediaRecorder(combinedStream, {
    mimeType: selectedMimeType,
    // Increase bitrate to 12 Mbps for High Quality 1080p/720p
    videoBitsPerSecond: 12000000 
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  
  // Handle errors
  recorder.onerror = (e) => {
    console.error("Recorder Error:", e);
  };

  return {
    start: async () => {
      // Ensure context is running (fixes potential 'suspended' state sticking time at 0)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      // Start the recorder first
      recorder.start();
      // Then start the audio source immediately
      source.start(0);
    },
    stop: () => {
      return new Promise((resolve) => {
        const cleanup = () => {
          try { source.stop(); } catch(e) {}
          try { source.disconnect(); } catch(e) {}
          try { dest.disconnect(); } catch(e) {}
          if (ctx.state !== 'closed') ctx.close();
        };

        // If already inactive, resolve immediately with what we have
        if (recorder.state === 'inactive') {
           const blob = new Blob(chunks, { type: selectedMimeType });
           cleanup();
           resolve(blob);
           return;
        }

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: selectedMimeType });
          cleanup();
          resolve(blob);
        };
        
        recorder.stop();
      });
    },
    getAudioContext: () => ctx
  };
};
