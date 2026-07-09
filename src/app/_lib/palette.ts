export type Band = "dawn" | "day" | "dusk" | "night";

export type Palette = {
  dark: boolean;
  bgTop: string;
  bgBottom: string;
  glow: string;
  floorTop: string;
  floorBottom: string;
  sandHi: string;
  sandLo: string;
  accent: string;
  text: string;
  textDim: string;
};

/**
 * 完全白黒(決定稿)。朝・昼は白地に黒い砂、夕・夜は黒地に白い砂と
 * 一日の中で図と地が反転する。琥珀(accent)は夢のリングだけに許された唯一の色。
 */
export const MONO: Record<Band, Palette> = {
  dawn: {
    dark: false,
    bgTop: "#EFEFED", bgBottom: "#E3E3E0", glow: "#FFFFFF",
    floorTop: "#DCDCD8", floorBottom: "#D0D0CC",
    sandHi: "#55554F", sandLo: "#2C2C29",
    accent: "#A8834C", text: "#2B2B29", textDim: "#757570",
  },
  day: {
    dark: false,
    bgTop: "#F7F7F5", bgBottom: "#ECECE9", glow: "#FFFFFF",
    floorTop: "#E2E2DE", floorBottom: "#D6D6D2",
    sandHi: "#504F4A", sandLo: "#262623",
    accent: "#A8834C", text: "#262624", textDim: "#71716C",
  },
  dusk: {
    dark: true,
    bgTop: "#1B1B1A", bgBottom: "#101010", glow: "#FFFFFF",
    floorTop: "#0C0C0B", floorBottom: "#080808",
    sandHi: "#E9E9E4", sandLo: "#B9B9B2",
    accent: "#D8A868", text: "#E9E9E4", textDim: "#8C8C86",
  },
  night: {
    dark: true,
    bgTop: "#131312", bgBottom: "#0A0A0A", glow: "#F4F4EF",
    floorTop: "#070707", floorBottom: "#050505",
    sandHi: "#F2F2EC", sandLo: "#C0C0B8",
    accent: "#E7B36B", text: "#EFEFEA", textDim: "#8F8F89",
  },
};

export function bandForDate(d: Date): Band {
  const h = d.getHours();
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 16) return "day";
  if (h >= 16 && h < 19) return "dusk";
  return "night";
}
