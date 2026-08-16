import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { VisemeEvent, Viseme } from "../types";

// --- IMPROVEMENT: Client-Side Caching ---
// Prevents re-calling the API if the user clicks "Generate" twice on the same file.
const visemeCache = new Map<string, VisemeEvent[]>();

// Helper to generate a unique key for the file
const getFileId = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;

// Helper to encode audio buffer to base64
const audioBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const generateVisemesFromAudio = async (
  audioFile: File,
  onProgress: (msg: string) => void,
  duration?: number
): Promise<VisemeEvent[]> => {
  
  // --- IMPROVEMENT: Safety Check ---
  // Gemini inline data has a size limit (approx 20MB). Check this before uploading.
  if (audioFile.size > 18 * 1024 * 1024) {
      throw new Error("File is too large for this demo (Max 18MB). Please trim the audio.");
  }

  // --- IMPROVEMENT: Check Cache ---
  const fileId = getFileId(audioFile);
  if (visemeCache.has(fileId)) {
      onProgress("Loaded from cache (no API cost)...");
      return visemeCache.get(fileId)!;
  }

  // Use the standard environment variable
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please check your environment configuration.");
  }

  onProgress("Initializing AI model...");
  const ai = new GoogleGenAI({ apiKey });

  onProgress("Processing audio file...");
  const arrayBuffer = await audioFile.arrayBuffer();
  const base64Audio = audioBufferToBase64(arrayBuffer);

  onProgress("Analyzing speech patterns with Gemini...");
  
  const durationContext = duration ? `The given audio file duration is approximately ${duration.toFixed(2)}seconds.` : "";

  // --- UPDATED: Robust Prompt with Thinking Instructions ---
  const prompt = `
    Analyze the given audio file data to generate a JSON array of Viseme events with corresponding timestamps.
    ${durationContext}
    You MUST process the audio from 0.00s to ${duration.toFixed(2)}seconds.
    The audio may contains long pauses (2-5 seconds). Do not stop generating when you hear silence.
    If the last timestamp in your JSON is significantly less than ${duration.toFixed(2)}seconds, then you have failed at task.
    Map visemes with 0.04s precision.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview", 
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: audioFile.type || "audio/mp3",
            data: base64Audio,
          },
        },
        { text: prompt },
      ],
    },
    config: {
      temperature: 1.7,
      topP: 0.95,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
      },
      systemInstruction: `
    You are an expert animator, whose only job is to map the visemes for the given audio file segements.

    Viseme Mapping Reference:
    - 'sil': Silence
    - 'pp': M, B, P
    - 'ff': F, V
    - 'th': TH
    - 'dd': T, D, S, Z
    - 'kk': K, G, NG
    - 'ch': CH, J, SH
    - 'ss': S, Z
    - 'nn': N
    - 'rr': R
    - 'aa': AA (Ah)
    - 'e': EH, AE
    - 'i': IH, EE
    - 'o': OH
    - 'u': UW, W

    JSON array Example:
    [
      { "viseme": "sil", "start": 0.00, "end": 0.15, "strength": 0.0 },
      { "viseme": "aa", "start": 0.15, "end": 0.45, "strength": 0.9 },
      ...
    ]
    
    Steps to taken:
     1. Analyse the given audio file.
     2. Carefully identify the timestamps for each phoneme in the audio.
     3. Use our "viseme mapping reference" and maps the phonemes you finded in audio to their corresponding visemes.
     4. If the audio amplitude is very low (silence/breathing), the segment must be omitted. Do not place any viseme in silence or very low amplitude segments.  
     5. Generate the JSON array with the timestamps (start and end information) with viseme applied on that timestamp. 
      `,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            viseme: { type: Type.STRING },
            start: { type: Type.NUMBER },
            end: { type: Type.NUMBER },
            strength: { type: Type.NUMBER },
          },
          required: ["viseme", "start", "end", "strength"],
        },
      },
    },
  });

  onProgress("Parsing response...");
  const text = response.text;
  
  if (!text) {
    throw new Error("No response from AI.");
  }

  try {
    const rawData = JSON.parse(text);
    // Validate and cast
    const visemes: VisemeEvent[] = rawData.map((item: any) => ({
      viseme: item.viseme as Viseme,
      start: item.start,
      end: item.end,
      strength: item.strength
    }));

    // --- IMPROVEMENT: Save to Cache ---
    visemeCache.set(fileId, visemes);

    return visemes;
  } catch (e) {
    console.error("Failed to parse JSON", e);
    throw new Error("AI response was not valid JSON.");
  }
};