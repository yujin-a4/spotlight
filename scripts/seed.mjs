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

const POOL = [
  ["POTHOLE", "HIGH", "차도 대형 포트홀"],
  ["POTHOLE", "HIGH", "포트홀 다수 발생"],
  ["POTHOLE", "MEDIUM", "도로 균열 및 침하"],
  ["POTHOLE", "MEDIUM", "아스팔트 파임 발생"],
  ["BROKEN_FACILITY", "HIGH", "보도블럭 심한 파손"],
  ["BROKEN_FACILITY", "MEDIUM", "보도 단차 위험"],
  ["BROKEN_FACILITY", "MEDIUM", "인도 포장 들뜸"],
  ["BROKEN_FACILITY", "LOW", "보도블럭 일부 균열"],
  ["TRASH", "MEDIUM", "쓰레기 무단투기 적치"],
  ["TRASH", "LOW", "생활쓰레기 방치"],
  ["TRASH", "LOW", "골목 쓰레기 투기"],
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

async function createReport(doc) {
  const res = await fetch(`${BASE}/reports?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        category: { stringValue: doc.category },
        severity: { stringValue: doc.severity },
        description: { stringValue: doc.description },
        lat: { doubleValue: doc.lat },
        lng: { doubleValue: doc.lng },
        address: { stringValue: doc.address },
        imageUrl: { stringValue: doc.imageUrl },
        status: { stringValue: "OPEN" },
        createdAt: { timestampValue: doc.createdAt },
        seed: { booleanValue: true }, // 시드 데이터 표시 (일괄 삭제용)
      },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

let n = 0;
for (const [alat, alng, count, area] of ANCHORS) {
  for (let i = 0; i < count; i++) {
    const [category, severity, description] = POOL[Math.floor(Math.random() * POOL.length)];
    const lat = alat + jitter();
    const lng = alng + jitter();
    const address = await geocode(lat, lng);
    const createdAt = new Date(Date.now() - Math.random() * 48 * 3600 * 1000).toISOString();
    await createReport({
      category, severity, description, lat, lng, address,
      imageUrl: IMAGES[category], createdAt,
    });
    n++;
    console.log(`[${n}] ${area} | ${description} (${severity}) | ${address}`);
  }
}
console.log(`\n완료: ${n}건 생성`);
