# 🔦 SpotLight

**AI 기반 생활 인프라 위험구역 자동 맵핑 서비스**

> 미션: "모든 시민이 도시의 센서가 되는 세상"
> 당신의 사진 한 장이, AI를 만나 더 안전한 도시가 됩니다.

시민이 길거리의 위험 요소(포트홀, 파손 시설물, 쓰레기 무단투기)를 **사진 한 장으로 신고**하면, **Gemini**가 카테고리와 심각도를 자동 분석하고, 지자체 관제 지도에 **실시간 히트맵**으로 시각화합니다.

_Google Cloud Study Jam Hackathon 2026 — Track: Google AI for Social Good_

## ✨ 핵심 기능

| | 기존 신고 앱 | SpotLight |
|---|---|---|
| 신고 | 로그인 + 6단계 수동 입력 | **사진 1장, 10초** (Gemini Vision 자동 분석) |
| 접수 후 | 티켓 목록을 사람이 읽고 판단 | **AI 관제 브리핑** — Gemini가 밀집 패턴 분석 → 대응 우선순위 제안 |
| 시민에게 | 신고하면 끝 (블랙홀) | **내 신고 실시간 추적** + 처리 완료 알림 + 임팩트 스탯 |

- **시민 모드 (`/`):** 사진 업로드 → GPS/EXIF 위치 자동 획득(실패 시 주소 직접 입력) → Gemini 분석(Structured Output으로 JSON 스키마 강제) → 도로명주소 표시 → 신고
- **관제 모드 (`/dashboard`):** Google Maps 히트맵(심각도 가중)/마커 토글, 실시간 신고 리스트, AI 관제 브리핑, 처리 완료 워크플로
- **내 신고 (`/my`):** 로그인 없는 기기 기반 추적, 처리 상태 실시간 반영
- **오신고 방어:** 위험 요소가 없는 사진(셀카·음식 등)은 AI가 `NONE`으로 분류 → 지도에 등록되지 않음

## 🛠 기술 스택

- **AI:** Gemini API (`gemini-flash-latest`) — 이미지 분석(Structured Output) + 관제 브리핑 생성
- **Frontend:** Next.js 16 + TypeScript + Tailwind CSS
- **Data:** Cloud Firestore (실시간 동기화)
- **Maps:** Google Maps JavaScript API + Geocoding API (역방향/정방향)
- **Infra:** Google Cloud (Cloud Run 배포)

## 🚀 실행 방법

```bash
npm install
cp .env.local.example .env.local   # 키 입력 (Gemini / Maps / Firestore)
npm run dev
```

- 시민 신고: http://localhost:3000
- 관제 대시보드: http://localhost:3000/dashboard

### 데모 시드 데이터

서울 주요 지점에 데모용 신고 데이터를 생성합니다:

```bash
node --env-file=.env.local scripts/seed.mjs
```

## 📄 문서

- [PRD.md](./PRD.md) — 제품 요구사항 정의서
