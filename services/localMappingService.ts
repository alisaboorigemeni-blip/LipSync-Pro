import { ShapeKeyMapping } from './types';

const standardVisemes = [
  "sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "ih", "oh", "ou"
];

export function generateLocalMapping(shapeKeys: string[]): ShapeKeyMapping {
  const mapping: ShapeKeyMapping = {};
  const lowerKeys = shapeKeys.map(k => k.toLowerCase());

  const findBestMatch = (patterns: string[]): string | undefined => {
    for (const pattern of patterns) {
       // Exact match
       const exactMatchIdx = lowerKeys.findIndex(k => k === pattern || k === `v_${pattern}` || k === `viseme_${pattern}`);
       if (exactMatchIdx !== -1) return shapeKeys[exactMatchIdx];
       
       // Partial match
       const includesIdx = lowerKeys.findIndex(k => k.includes(pattern));
       if (includesIdx !== -1) return shapeKeys[includesIdx];
    }
    return undefined;
  };

  for (const viseme of standardVisemes) {
    if (viseme === 'sil') continue; // silence has no shape key
    
    let match: string | undefined;
    const vLower = viseme.toLowerCase();

    // Heuristics based on common standard visemes vs common 3D model blendshapes
    switch (vLower) {
      case 'pp': match = findBestMatch(['v_pp', 'viseme_pp', 'pp', 'p', 'b', 'm', 'closed']); break;
      case 'ff': match = findBestMatch(['v_ff', 'viseme_ff', 'ff', 'f', 'v', 'lipbite']); break;
      case 'th': match = findBestMatch(['v_th', 'viseme_th', 'th', 'tongue']); break;
      case 'dd': match = findBestMatch(['v_dd', 'viseme_dd', 'dd', 'd', 't']); break;
      case 'kk': match = findBestMatch(['v_kk', 'viseme_kk', 'kk', 'k', 'g']); break;
      case 'ch': match = findBestMatch(['v_ch', 'viseme_ch', 'ch', 'sh', 'j']); break;
      case 'ss': match = findBestMatch(['v_ss', 'viseme_ss', 'ss', 's', 'z']); break;
      case 'nn': match = findBestMatch(['v_nn', 'viseme_nn', 'nn', 'n']); break;
      case 'rr': match = findBestMatch(['v_rr', 'viseme_rr', 'rr', 'r', 'er']); break;
      case 'aa': match = findBestMatch(['v_aa', 'viseme_aa', 'aa', 'a', 'jawdrop', 'open']); break;
      case 'e':  match = findBestMatch(['v_e', 'viseme_e', 'e', 'eh']); break;
      case 'ih': match = findBestMatch(['v_ih', 'viseme_ih', 'ih', 'i', 'ee']); break;
      case 'oh': match = findBestMatch(['v_oh', 'viseme_oh', 'oh', 'o', 'round']); break;
      case 'ou': match = findBestMatch(['v_ou', 'viseme_ou', 'ou', 'u', 'oo', 'pucker']); break;
      default:   match = findBestMatch([vLower, `v_${vLower}`, `viseme_${vLower}`]); break;
    }

    if (match) {
      mapping[viseme] = match;
    }
  }
  return mapping;
}
