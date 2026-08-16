export interface VisemeEvent {
  time?: number;
  start?: number;
  end?: number;
  viseme: string;
}

export interface PhonemeEvent {
  start: number;
  end: number;
  phoneme: string;
}

export interface WordEvent {
  start: number;
  end: number;
  word: string;
}

export interface AnalysisResult {
  duration: number;
  interval: number;
  visemes: VisemeEvent[];
  phonemes?: PhonemeEvent[];
  words?: WordEvent[];
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage: string;
  progress: number;
  error?: string;
  result?: AnalysisResult;
}

export interface WhisperModel {
  name: string;
  installed: boolean;
  downloading?: boolean;
}

const DEFAULT_BACKEND_URL = 'http://localhost:8000';

function getBaseUrl() {
  return localStorage.getItem('whisper_backend_url') || DEFAULT_BACKEND_URL;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/health`, { method: 'GET' });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function fetchModels(): Promise<WhisperModel[]> {
  const res = await fetch(`${getBaseUrl()}/api/models`);
  if (!res.ok) throw new Error('Failed to fetch models');
  return res.json();
}

export async function analyzeAudio(file: File, config: { model: string, language: string, interval: number, smoothing: boolean, device?: string }): Promise<{ job_id: string }> {
  const formData = new FormData();
  formData.append('audio', file);
  formData.append('model', config.model);
  formData.append('language', config.language);
  formData.append('interval', config.interval.toString());
  formData.append('smoothing', config.smoothing.toString());
  if (config.device && config.device !== 'Auto') {
      formData.append('device', config.device);
  }

  const res = await fetch(`${getBaseUrl()}/api/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Analysis failed');
  }

  return res.json();
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${getBaseUrl()}/api/jobs/${jobId}`);
  if (!res.ok) throw new Error('Failed to fetch job status');
  return res.json();
}

export async function getJobResult(jobId: string): Promise<AnalysisResult> {
  const res = await fetch(`${getBaseUrl()}/api/jobs/${jobId}/result`);
  if (!res.ok) throw new Error('Failed to fetch job result');
  return res.json();
}

export type BackendSocketMessage =
    | { type: "health"; health: { status: "ok"; version: string } }
    | { type: "models"; models: WhisperModel[] }
    | { type: "upload_ready" }
    | { type: "accepted"; job: JobStatus }
    | { type: "status"; job: JobStatus }
    | { type: "result"; job_id: string; result: AnalysisResult }
    | { type: "error"; error: string; job?: JobStatus };

export interface UnifiedBackendSocket {
    analyze(file: File, config: {
        model: string;
        language: string;
        interval: number;
        smoothing: boolean;
        device?: string;
    }): void;
    close(): void;
}

export function connectBackend(
    onMessage: (message: BackendSocketMessage) => void,
    onOffline: () => void,
): UnifiedBackendSocket {
    const socketUrl = getBaseUrl().replace(/^http/, "ws");
    const socket = new WebSocket(`${socketUrl}/api/ws`);
    let upload: File | null = null;

    socket.onmessage = (event) => {
        const message: BackendSocketMessage = JSON.parse(event.data);
        if (message.type === "upload_ready") {
            if (!upload) {
                onMessage({ type: "error", error: "No audio file is waiting to upload." });
                return;
            }
            socket.send(upload);
            upload = null;
        }
        onMessage(message);
    };
    socket.onerror = () => onOffline();
    socket.onclose = () => onOffline();

    return {
        analyze(file, config) {
            if (socket.readyState !== WebSocket.OPEN) {
                onMessage({ type: "error", error: "The backend socket is not connected." });
                return;
            }
            upload = file;
            socket.send(JSON.stringify({
                type: "analyze",
                file_name: file.name,
                model: config.model,
                language: config.language,
                interval: config.interval,
                smoothing: config.smoothing,
                device: config.device || "Auto",
            }));
        },
        close() {
            socket.close();
        },
    };
}
