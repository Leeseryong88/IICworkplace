export type FloorId = '5F' | '6F' | '7F';

export type ZoneId = string;

export interface Zone {
  id: ZoneId;
  floorId?: FloorId; // 과거 호환
  workspaceId?: string; // 새 구조: 작업장 기준으로 필터
  name: string; // 팀 이름 또는 구역명
  purpose?: string; // 사용 목적
  note?: string; // 비고
  manager?: string; // 담당자
  project?: string; // 프로젝트명
  brand?: string;   // 브랜드 (GM, TAM, NUD, ATS, NUF)
  color?: string; // HEX or tailwind color
  // 이미지 기준 정규화 좌표(0~1)
  points: Array<{ x: number; y: number }>; // 기존 다각형 호환 유지
  rect?: { x: number; y: number; width: number; height: number }; // 사각형
  team?: string; // 팀 명(필터용)
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  updatedAt: number; // epoch ms
  active: boolean;
}

export interface Floor {
  id: FloorId;
  title: string;
  planUrl?: string; // Storage URL
  width?: number; // 원본 이미지 폭
  height?: number; // 원본 이미지 높이
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  updatedAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  categoryId: string;
  planUrl?: string;
  updatedAt: number;
}


