export enum Viseme {
  SIL = 'sil', // Silence/Neutral
  PP = 'pp',   // P, B, M (Lips closed)
  FF = 'ff',   // F, V (Teeth on lip)
  TH = 'th',   // TH (Tongue between teeth)
  DD = 'dd',   // T, D, S, Z (Tongue behind teeth)
  KK = 'kk',   // K, G, NG
  CH = 'ch',   // CH, J, SH
  SS = 'ss',   // S, Z
  NN = 'nn',   // N
  RR = 'rr',   // R
  AA = 'aa',   // Wide open (Ah)
  E = 'e',     // Eh
  I = 'i',     // Ih, Ee
  O = 'o',     // Oh
  U = 'u'      // Oo, W
}

export interface VisemeEvent {
  viseme: Viseme;
  start: number;   // seconds
  end: number;     // seconds
  strength: number; // 0.0 to 1.0
}

export interface ShapeKeyMapping {
  // Maps a Viseme ID (e.g., 'aa') to a Mesh Shape Key Name (e.g., 'mouth_open')
  [viseme: string]: string | null;
}

export interface MeshInfo {
  name: string;
  shapeKeys: string[];
}
