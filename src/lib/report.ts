// 신고 데이터 공통 타입 + 한글 라벨 매핑

export type Category = "POTHOLE" | "BROKEN_FACILITY" | "TRASH" | "OTHER" | "NONE";
export type Severity = "HIGH" | "MEDIUM" | "LOW";

export interface AnalysisResult {
  category: Category;
  severity: Severity;
  description: string;
  // AI 조치 처방 (공무원 대시보드 전용 표시)
  suggestedAction?: string;
  department?: string;
  riskNote?: string;
}

export interface Report extends AnalysisResult {
  id: string;
  imageUrl: string;
  lat: number;
  lng: number;
  address?: string;
  reportCount?: number; // 동일 위험 누적 신고 횟수 (AI 중복 병합)
  status: "OPEN" | "RESOLVED";
  createdAt: { seconds: number } | null;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  POTHOLE: "포트홀",
  BROKEN_FACILITY: "시설물 파손",
  TRASH: "쓰레기 무단투기",
  OTHER: "기타",
  NONE: "위험 요소 없음",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  HIGH: "상",
  MEDIUM: "중",
  LOW: "하",
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  HIGH: "#ef4444",
  MEDIUM: "#f59e0b",
  LOW: "#22c55e",
};

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};
