// 데모용 시드 데이터 생성 스크립트
// 실행: node --env-file=.env.local scripts/seed.mjs
// 서울 주요 지점 주변에 신고 데이터를 뿌려 히트맵이 살아있는 것처럼 보이게 한다.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const MAPS_KEY = process.env.NEXT_PUBLIC_MAPS_API_KEY;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

if (!PROJECT_ID || !API_KEY) {
  console.error("환경변수 누락 — node --env-file=.env.local scripts/seed.mjs 로 실행하세요.");
  process.exit(1);
}

const img = (f) =>
  `data:image/jpeg;base64,${readFileSync(join(__dir, "seed-images", f)).toString("base64")}`;

const IMAGES = {
  POTHOLE: img("pothole_seed.jpg"),
  TRASH: img("trash_seed.jpg"),
  BROKEN_FACILITY: img("facility.jpg"),
  OTHER: img("facility.jpg"),
};

// 앵커 지점: [위도, 경도, 뿌릴 개수, 지역명]
// 신라호텔(행사장) 주변을 가장 밀집시켜 히트맵 핫존을 만든다.
const ANCHORS = [
  [37.5559, 127.0057, 6, "중구 장충동(행사장 인근)"],
  [37.5665, 126.978, 4, "시청/을지로"],
  [37.5610, 126.9846, 3, "명동/충무로"],
  [37.4980, 127.0276, 3, "강남역"],
  [37.5563, 126.9236, 2, "홍대입구"],
  [37.5305, 126.9647, 2, "용산/이태원"],
  [37.5714, 127.0090, 2, "동대문/신당"],
];

// [category, severity, description, suggestedAction, department, riskNote]
const POOL = [
  ["POTHOLE", "HIGH", "차도 대형 포트홀", "아스팔트 긴급 패칭, 안전콘 설치 권장", "도로관리과", "차량 타이어 파손 및 추돌 사고 우려"],
  ["POTHOLE", "HIGH", "포트홀 다수 발생", "구간 전면 재포장 검토 필요", "도로관리과", "이륜차 전도 등 인명 사고 우려"],
  ["POTHOLE", "MEDIUM", "도로 균열 및 침하", "균열 실링 및 침하부 보수", "도로관리과", "우천 시 포트홀로 확대 우려"],
  ["POTHOLE", "MEDIUM", "아스팔트 파임 발생", "부분 패칭 보수 필요", "도로관리과", "차량 하부 손상 우려"],
  ["BROKEN_FACILITY", "HIGH", "보도블럭 심한 파손", "보도블럭 교체 및 임시 안전펜스 설치", "시설관리과", "보행자 낙상 사고 우려"],
  ["BROKEN_FACILITY", "MEDIUM", "보도 단차 위험", "단차 평탄화 작업 필요", "시설관리과", "노약자·유모차 통행 시 전도 우려"],
  ["BROKEN_FACILITY", "MEDIUM", "인도 포장 들뜸", "들뜬 포장재 재시공 필요", "시설관리과", "보행자 걸려 넘어짐 우려"],
  ["BROKEN_FACILITY", "LOW", "보도블럭 일부 균열", "정기 보수 시 교체 권장", "시설관리과", "균열 확대 시 파손 우려"],
  ["TRASH", "MEDIUM", "쓰레기 무단투기 적치", "수거 조치 및 단속 카메라 검토", "환경미화과", "악취·해충 발생 및 추가 투기 유발"],
  ["TRASH", "LOW", "생활쓰레기 방치", "수거 조치 필요", "환경미화과", "도시 미관 저해 및 투기 상습화 우려"],
  ["TRASH", "LOW", "골목 쓰레기 투기", "수거 및 경고문 부착 권장", "환경미화과", "상습 투기 구역화 우려"],
];

const jitter = () => (Math.random() - 0.5) * 0.004; // 약 ±200m

async function geocode(lat, lng) {
  try {
    const r = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ko&key=${MAPS_KEY}`
    );
    const d = await r.json();
    return d.results?.[0]?.formatted_address?.replace(/^대한민국\s*/, "") ?? "주소 미상";
  } catch {
    return "주소 미상";
  }
}

// 기존 시드 데이터(seed == true) 일괄 삭제
async function purgeSeeds() {
  const res = await fetch(`${BASE}:runQuery?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "reports" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "seed" },
            op: "EQUAL",
            value: { booleanValue: true },
          },
        },
        limit: 500,
      },
    }),
  });
  const rows = await res.json();
  const names = rows.filter((r) => r.document).map((r) => r.document.name);
  for (const name of names) {
    await fetch(`https://firestore.googleapis.com/v1/${name}?key=${API_KEY}`, {
      method: "DELETE",
    });
  }
  console.log(`기존 시드 ${names.length}건 삭제`);
}

async function createReport(doc) {
  const res = await fetch(`${BASE}/reports?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        category: { stringValue: doc.category },
        severity: { stringValue: doc.severity },
        description: { stringValue: doc.description },
        suggestedAction: { stringValue: doc.suggestedAction },
        department: { stringValue: doc.department },
        riskNote: { stringValue: doc.riskNote },
        lat: { doubleValue: doc.lat },
        lng: { doubleValue: doc.lng },
        address: { stringValue: doc.address },
        imageUrl: { stringValue: doc.imageUrl },
        status: { stringValue: "OPEN" },
        reportCount: { integerValue: String(doc.reportCount ?? 1) },
        createdAt: { timestampValue: doc.createdAt },
        seed: { booleanValue: true }, // 시드 데이터 표시 (일괄 삭제용)
      },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

await purgeSeeds();

// 같은 앵커 지역에서 같은 카테고리가 중복 추첨되면 별건이 아니라
// 하나의 신고로 병합(reportCount 누적, 심각도는 최고치)한다.
// — 실제 서비스의 AI 중복 병합을 거친 상태를 재현.
const SEV_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 };

let n = 0;
for (const [alat, alng, count, area] of ANCHORS) {
  const groups = new Map(); // category → 병합된 신고 1건
  for (let i = 0; i < count; i++) {
    const [category, severity, description, suggestedAction, department, riskNote] =
      POOL[Math.floor(Math.random() * POOL.length)];
    const existing = groups.get(category);
    if (existing) {
      existing.reportCount += 1;
      if (SEV_RANK[severity] > SEV_RANK[existing.severity]) {
        existing.severity = severity;
      }
    } else {
      groups.set(category, {
        category, severity, description, suggestedAction, department, riskNote,
        lat: alat + jitter(), lng: alng + jitter(), reportCount: 1,
      });
    }
  }

  for (const doc of groups.values()) {
    doc.address = await geocode(doc.lat, doc.lng);
    doc.createdAt = new Date(Date.now() - Math.random() * 48 * 3600 * 1000).toISOString();
    doc.imageUrl = IMAGES[doc.category];
    await createReport(doc);
    n++;
    console.log(
      `[${n}] ${area} | ${doc.description} (${doc.severity}) x${doc.reportCount} | ${doc.department} | ${doc.address}`
    );
  }
}
console.log(`\n완료: ${n}건 생성 (병합 반영)`);
