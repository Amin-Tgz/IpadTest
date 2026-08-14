import { PALETTE } from "./constants.js";

export const FEATURE_FLAGS = {
  jointEditor: true,
  autoRevive: false,
  drawingAnalysis: true,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export const BACKGROUND_COLOR = PALETTE.background;
export const APP_NAME = "Pencil AI";
