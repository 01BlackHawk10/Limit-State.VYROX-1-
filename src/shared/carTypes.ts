export type CarModelId =
  | 'bmw-m4-gt3-evo'
  | 'bmw-m4-widebody'
  | 'aston-vantage-gt3'
  | 'aston-vulcan-amr'
  | 'audi-r8-lms-evo'
  | 'lambo-huracan-gt3-evo2'
  | 'mclaren-720s-gt3'
  | 'acura-nsx-gt3'
  | 'mercedes-amg-gt3-evo'
  | 'toyota-gt-one-ts020'
  | 'mazda-furai'
  | 'bmw-m-hybrid-v8'
  | 'cadillac-v-series-r'
  | 'mazda-787b'
  | 'honda-ra272-f1'
  | 'ferrari-250-testa-rossa'
  | 'koenigsegg-agera-rs'
  | 'bugatti-bolide'
  | 'de-tomaso-p900'
  | 'mclaren-f1-gtr-longtail'
  | 'ferrari-f40-lbwk'
  | 'subaru-wrx-sti'
  | 'honda-s2000'
  | 'vw-polo-r-wrx'
  | 'vw-golf-gti-mk2'
  | 'toyota-ae86-trueno';

export type CarClassId = 'gt3' | 'hypercar' | 'prototype' | 'street_rally';

export const CAR_CLASS_LABELS: Record<CarClassId, string> = {
  gt3: 'GT3',
  hypercar: 'Hypercar',
  prototype: 'Prototype',
  street_rally: 'Street & Rally',
};

export const CAR_CLASS_BY_ID: Record<CarModelId, CarClassId> = {
  'bmw-m4-gt3-evo': 'gt3',
  'bmw-m4-widebody': 'street_rally',
  'aston-vantage-gt3': 'gt3',
  'aston-vulcan-amr': 'hypercar',
  'audi-r8-lms-evo': 'gt3',
  'lambo-huracan-gt3-evo2': 'gt3',
  'mclaren-720s-gt3': 'gt3',
  'acura-nsx-gt3': 'gt3',
  'mercedes-amg-gt3-evo': 'gt3',
  'toyota-gt-one-ts020': 'prototype',
  'mazda-furai': 'prototype',
  'bmw-m-hybrid-v8': 'prototype',
  'cadillac-v-series-r': 'prototype',
  'mazda-787b': 'prototype',
  'honda-ra272-f1': 'prototype',
  'ferrari-250-testa-rossa': 'prototype',
  'koenigsegg-agera-rs': 'hypercar',
  'bugatti-bolide': 'hypercar',
  'de-tomaso-p900': 'hypercar',
  'mclaren-f1-gtr-longtail': 'hypercar',
  'ferrari-f40-lbwk': 'hypercar',
  'subaru-wrx-sti': 'street_rally',
  'honda-s2000': 'street_rally',
  'vw-polo-r-wrx': 'street_rally',
  'vw-golf-gti-mk2': 'street_rally',
  'toyota-ae86-trueno': 'street_rally',
};

export type LegacyBenchmarkCarId = 'mclaren-650s-gt3';
export type AnyCarSpecId = CarModelId | LegacyBenchmarkCarId;

export const ALL_ACTIVE_CAR_IDS: readonly CarModelId[] = [
  'bmw-m4-gt3-evo',
  'bmw-m4-widebody',
  'aston-vantage-gt3',
  'aston-vulcan-amr',
  'audi-r8-lms-evo',
  'lambo-huracan-gt3-evo2',
  'mclaren-720s-gt3',
  'acura-nsx-gt3',
  'mercedes-amg-gt3-evo',
  'toyota-gt-one-ts020',
  'mazda-furai',
  'bmw-m-hybrid-v8',
  'cadillac-v-series-r',
  'mazda-787b',
  'honda-ra272-f1',
  'ferrari-250-testa-rossa',
  'koenigsegg-agera-rs',
  'bugatti-bolide',
  'de-tomaso-p900',
  'mclaren-f1-gtr-longtail',
  'ferrari-f40-lbwk',
  'subaru-wrx-sti',
  'honda-s2000',
  'vw-polo-r-wrx',
  'vw-golf-gti-mk2',
  'toyota-ae86-trueno',
];

export function normalizeCarModelId(raw: unknown): CarModelId {
  if (typeof raw === 'string' && (ALL_ACTIVE_CAR_IDS as readonly string[]).includes(raw)) {
    return raw as CarModelId;
  }
  return 'bmw-m4-gt3-evo';
}

