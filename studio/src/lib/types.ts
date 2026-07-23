import type { FabricFamily } from './fabric-generator';

export interface ColourRow {
  id: string;
  name: string;
  l: number;
  c: number;
  h: number;
  order: number;
}

export interface FabricRow {
  id: string;
  name: string;
  family: FabricFamily;
  weight: string;
  width: string;
  comp: string;
  nc: number;
  hand: string;
  sheen: number;
  flow: number;
  stretch: number;
  seed: number;
  price: number;
  heroIndex: number;
  colours: ColourRow[];
}
