import { Viseme } from './types';

export const VISEMES_LIST = [
  { 
    id: Viseme.SIL, 
    label: 'Neutral / Silence', 
    description: 'Resting face',
    aliases: ['basis', 'neutral', 'rest', 'idle', 'sil', 'silence']
  },
  { 
    id: Viseme.PP, 
    label: 'M / B / P', 
    description: 'Lips pressed together',
    aliases: ['mouthClose', 'm_b_p', 'viseme_pp', 'pp', 'mbp', 'lipsClosed']
  },
  { 
    id: Viseme.FF, 
    label: 'F / V', 
    description: 'Upper teeth touch lower lip',
    aliases: ['f_v', 'viseme_ff', 'ff', 'lipBite', 'fv']
  },
  { 
    id: Viseme.TH, 
    label: 'TH', 
    description: 'Tongue tip between teeth',
    aliases: ['viseme_th', 'th', 'tongueOut']
  },
  { 
    id: Viseme.DD, 
    label: 'T / D', 
    description: 'Tongue tip behind upper teeth',
    aliases: ['viseme_dd', 'dd', 'td', 't_d']
  },
  { 
    id: Viseme.KK, 
    label: 'K / G', 
    description: 'Back of tongue raises',
    aliases: ['viseme_kk', 'kk', 'kg', 'k_g']
  },
  { 
    id: Viseme.CH, 
    label: 'CH / SH / J', 
    description: 'Lips flared forward',
    aliases: ['viseme_ch', 'ch', 'sh', 'j', 'ch_j_sh']
  },
  { 
    id: Viseme.SS, 
    label: 'S / Z', 
    description: 'Teeth together, lips slightly open',
    aliases: ['viseme_ss', 'ss', 'sz', 's_z']
  },
  { 
    id: Viseme.NN, 
    label: 'N', 
    description: 'Nose sound',
    aliases: ['viseme_nn', 'nn']
  },
  { 
    id: Viseme.RR, 
    label: 'R', 
    description: 'Lips rounded slightly',
    aliases: ['viseme_rr', 'rr']
  },
  { 
    id: Viseme.AA, 
    label: 'AA / AH', 
    description: 'Jaw dropped open',
    aliases: ['jawOpen', 'mouthOpen', 'viseme_aa', 'aa', 'ah', 'a_ah']
  },
  { 
    id: Viseme.E, 
    label: 'EH / AE', 
    description: 'Medium open mouth',
    aliases: ['viseme_e', 'e', 'eh', 'ae']
  },
  { 
    id: Viseme.I, 
    label: 'IH / EE', 
    description: 'Wide mouth, narrow opening',
    aliases: ['viseme_i', 'i', 'ih', 'ee']
  },
  { 
    id: Viseme.O, 
    label: 'OH', 
    description: 'Lips rounded open',
    aliases: ['viseme_o', 'o', 'oh', 'mouthRound']
  },
  { 
    id: Viseme.U, 
    label: 'UW / W', 
    description: 'Lips puckered small',
    aliases: ['viseme_u', 'u', 'uw', 'w', 'pucker', 'mouthPucker']
  },
];