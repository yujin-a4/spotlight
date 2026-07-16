# 📄 Product Requirements Document (PRD)

**프로젝트명:** SpotLight (가칭) — AI 기반 생활 인프라 위험구역 자동 맵핑 서비스
**문서 버전:** 2.0 (Google Cloud Study Jam Hackathon MVP)
**해커톤 트랙:** Google AI for Social Good
**개발 시간:** 120분 (13:20 ~ 15:20)

---

## 1. 제품 개요 (Product Overview)

> **미션: "모든 시민이 도시의 센서가 되는 세상"**
> 위험을 발견한 순간과 신고하는 행동 사이의 마찰을 AI가 0으로 만들면, 선의(善意)는 데이터가 되고 데이터는 더 안전한 도시가 된다. SpotLight는 AI 기술로 시민의 작은 행동을 사회적 임팩트로 전환하는 프로젝트다.

**SpotLight**는 시민이 길거리의 위험 요소(포트홀, 파손된 시설물, 쓰레기 무단 투기 등)를 **사진 한 장으로 신고**하면, Gemini가 위험도와 카테고리를 자동 분석하여 지자체 관제 지도에 **실시간 히트맵**으로 시각화하는 '마찰 없는(Zero-Friction) 공공 안전 리포팅 서비스'입니다.

- **목적:** 텍스트 입력 없이 사진 한 장으로 완결되는 신고 경험을 제공하여, 지역 사회의 위험 데이터 수집을 자동화하고 지자체의 대응 우선순위 판단을 돕는다.
- **타겟 유저:**
  - **시민 (Reporter):** 동네에서 위험 요소를 발견한 일반인, 배달 라이더
  - **공무원 (Resolver):** 한정된 인력으로 관할 구역 인프라 보수를 담당하는 지자체 관리자

## 2. 해결하고자 하는 문제 (Pain Points)

- **시민 측면:** 기존 신고 앱(안전신문고)은 앱 설치 → 로그인/본인인증 → 신고 유형 선택(4단계 카테고리) → 사진 첨부 → 지도에서 위치 수동 지정 → 신고 내용 텍스트 작성까지 거쳐야 한다. 문제의식이 있어도 절차의 번거로움 때문에 신고를 포기한다.
- **지자체 측면:** 방대한 관할 구역을 소수 인력이 매일 순찰할 수 없고, 접수된 신고도 텍스트 위주라 현장의 심각도를 즉시 파악하고 우선순위를 매기기 어렵다.

## 3. 핵심 기능 요구사항 (Core Features — MVP)

### 3.1. 시민 모드: 원클릭 AI 신고 플로우 (Mobile Web)

사용자는 **사진 업로드 단일 액션**만 수행하며, 나머지는 AI가 처리한다.

| 기능 | 상세 설명 | 요구사항 / 로직 |
| --- | --- | --- |
| 이미지 업로드 | 현장 사진 촬영 또는 갤러리 선택 | `<input type="file" accept="image/*" capture>` |
| 위치 획득 | 신고 지점의 위도/경도 자동 추출 | **1순위: 브라우저 Geolocation API**(현재 위치). 2순위 폴백: EXIF GPS 태그(`exifr` 라이브러리로 클라이언트에서 파싱 — 단, 모바일 OS가 위치 태그를 제거하는 경우가 많아 폴백으로만 사용) |
| AI 비전 분석 | 업로드 이미지의 위험 상태 분석 | Gemini API 호출, **Structured Output으로 JSON 스키마 강제** (§5 참조) |
| 위험요소 없음 처리 | 무관한 사진(셀카, 음식 등) 방어 | AI가 `NONE` 카테고리로 분류 시 지도에 표시하지 않고 "위험 요소가 발견되지 않았습니다" 안내 |
| 신고 완료 화면 | 분석 결과 확인 | 분석 대기 중 로딩 스피너, 완료 시 카테고리·심각도·요약 표시 |

### 3.2. 공무원 관제 모드: 실시간 위험 히트맵 대시보드 (PC Web)

Firestore 실시간 동기화(`onSnapshot`)로 새로고침 없이 즉시 반영되는 대시보드.

| 기능 | 상세 설명 | 요구사항 / 로직 |
| --- | --- | --- |
| 실시간 맵 | Google Maps 위에 신고 데이터 시각화 | **히트맵 레이어(`visualization.HeatmapLayer`) + 마커 뷰 토글**. 히트맵 가중치 = 심각도(HIGH 3 / MEDIUM 2 / LOW 1) |
| 심각도 마커 | 마커 모드에서 심각도별 색상 구분 | 🔴 HIGH / 🟡 MEDIUM / 🟢 LOW |
| 신고 리스트 | 맵 우측에 최신 신고 카드 리스트 | 카드 클릭 시 해당 마커로 지도 이동 + 현장 사진 확대 |
| 처리 상태 관리 | 신고 건 처리 루프 완성 | 카드에 "처리 완료" 버튼 → Firestore `status` 필드 갱신(`OPEN` → `RESOLVED`), 완료 건은 지도에서 제외 |

## 4. 기술 스택 및 아키텍처 (Tech Stack)

해커톤 규정상 **Google AI 기술 활용 필수** — 전 스택을 Google 생태계로 구성한다.

| 레이어 | 기술 | 선정 이유 |
| --- | --- | --- |
| 프론트엔드 | Next.js + TypeScript + Tailwind CSS | 모바일/PC 반응형 신속 구축, AI 응답 JSON 타입 안전성 |
| AI 모델 | **Gemini API — `gemini-flash-latest`** | 저지연 멀티모달 분석. API 키는 현장 배부 @gcplab.me 계정으로 AI Studio에서 발급 |
| 백엔드/DB | Firebase (Firestore + Cloud Storage) | 서버리스로 백엔드 구축 시간 0에 수렴. 이미지는 Storage, 분석 결과·GPS는 Firestore |
| 지도 | Google Maps JavaScript API (+ visualization 라이브러리) | 히트맵 레이어 기본 제공 |
| 배포 | Cloud Run 또는 Firebase Hosting | 심사용 데모 URL 제공 |

> ⚠ **해커톤 계정 주의사항:** 행사 종료 시 GCP 프로젝트 즉시 삭제 → 코드는 수시로 개인 GitHub에 푸시. API 키 노출 금지(Gemini 호출은 Next.js API Route 서버 사이드에서 수행). 미보안 HTTP 포트·개방 DB 금지.

## 5. AI 설계 (Gemini Structured Output)

프롬프트에만 의존하지 않고 **`responseMimeType: "application/json"` + `responseSchema`로 출력 형식을 API 레벨에서 강제**한다. 데모 중 JSON 파싱 실패 리스크를 설계로 제거.

```ts
// generationConfig
{
  responseMimeType: "application/json",
  responseSchema: {
    type: "object",
    properties: {
      category:    { type: "string", enum: ["POTHOLE", "BROKEN_FACILITY", "TRASH", "OTHER", "NONE"] },
      severity:    { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
      description: { type: "string" }  // 한국어 15자 이내 요약
    },
    required: ["category", "severity", "description"]
  }
}
```

**시스템 프롬프트 초안:**

```text
너는 도시 인프라 위험도를 판별하는 안전 전문가 시스템이다.
첨부된 현장 사진을 분석하여 지정된 JSON 스키마로만 응답한다.

[분석 기준]
1. category:
   - POTHOLE: 도로 포트홀/침하
   - BROKEN_FACILITY: 파손된 시설물(가드레일, 맨홀, 보도블럭, 표지판 등)
   - TRASH: 쓰레기 무단투기
   - OTHER: 그 외 시민 안전 위협 요소
   - NONE: 사진에 위험 요소가 없음(인물 사진, 음식, 실내 등)
2. severity:
   - HIGH: 즉시 인명 피해 가능성 있음
   - MEDIUM: 보수 필요
   - LOW: 미관상 문제, 위험도 낮음
   - category가 NONE이면 LOW로 고정
3. description: 위험 상황을 한국어 15자 이내로 요약.

[예시]
- 깊은 포트홀 사진 → {"category":"POTHOLE","severity":"HIGH","description":"차도 대형 포트홀 발생"}
- 카페 음료 사진 → {"category":"NONE","severity":"LOW","description":"위험 요소 없음"}
```

- 카테고리/심각도는 **영문 enum으로 받고 UI에서만 한글 표시** (코드 비교·필터링 안정성).
- 한글 라벨 매핑: `POTHOLE→포트홀`, `BROKEN_FACILITY→시설물 파손`, `TRASH→쓰레기 무단투기`, `OTHER→기타`, `HIGH→상`, `MEDIUM→중`, `LOW→하`

## 6. 데이터 모델 (Firestore)

```ts
// collection: reports
{
  imageUrl: string,        // Cloud Storage 다운로드 URL
  lat: number, lng: number,
  category: "POTHOLE" | "BROKEN_FACILITY" | "TRASH" | "OTHER",  // NONE은 저장하지 않음
  severity: "HIGH" | "MEDIUM" | "LOW",
  description: string,
  status: "OPEN" | "RESOLVED",
  createdAt: Timestamp
}
```

## 7. Out of Scope (의도적 제외 — 향후 과제)

- **중복 신고 병합:** 같은 위치 다중 신고 시 마커가 중복 생성됨. MVP에서는 오히려 히트맵 가중치가 자연 증가하는 것으로 갈음. (향후: 반경 20m 내 동일 카테고리 클러스터링)
- 사용자 인증/신고 이력, 지자체 부서 자동 배정, 처리 결과 시민 알림, 악성 신고 신뢰도 점수

## 8. 성공 지표 및 심사 기준 대응

| 심사 기준 | 어필 포인트 |
| --- | --- |
| **Technical Demo** | Structured Output으로 JSON 응답 안정성 보장 → 라이브 데모 무결점 시연. Firestore 실시간 동기화로 신고 즉시 대시보드 반영(관객 참여형 데모 가능) |
| **Impact** | 신고 소요 시간: 안전신문고 대비(로그인+카테고리 선택+위치 지정+내용 작성) → **사진 1장, 10초 이내** (리허설 실측치로 갱신) |
| **Creativity** | 신고 '접수'가 아닌 도시 단위 **위험 히트맵 자동 생성** — 개별 민원 처리를 넘어 예방적 인프라 관리 데이터로 전환 |

**데모 시나리오 (2분):** ① 발표자가 폰으로 현장 사진 업로드 → ② 3초 내 AI 분석 완료 팝업 → ③ 스크린의 관제 대시보드에 실시간 히트맵 갱신 → ④ 공무원 모드에서 "처리 완료" 클릭 → 지도에서 소멸.

## 9. 120분 개발 타임라인

| 시간 | 작업 |
| --- | --- |
| 0–15분 | GCP 계정 등록, Firebase 프로젝트/AI Studio API 키 세팅, Next.js 보일러플레이트 |
| 15–50분 | 시민 모드: 업로드 + Geolocation + Gemini API Route + Firestore 저장 |
| 50–90분 | 관제 모드: Maps 히트맵/마커 + 실시간 리스트 + 처리 완료 버튼 |
| 90–110분 | 배포(Cloud Run/Hosting), 실사진 테스트, 데모 리허설 |
| 110–120분 | 제출물 정리: GitHub public repo, 프로젝트 소개, 데모 영상 녹화 |
