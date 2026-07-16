import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const RADIUS_M = 60; // 이 반경 내 동일 카테고리 신고만 중복 후보로 검토
const MAX_CANDIDATES = 3;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// data URL → Gemini inlineData 파트로 변환
function toPart(dataUrl: string) {
  const [head, base64] = dataUrl.split(",");
  const mimeType = head.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
  return { inlineData: { mimeType, data: base64 } };
}

export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl, lat, lng, category, severity } = await req.json();
    if (!imageDataUrl || !lat || !lng || !category) {
      return NextResponse.json({ duplicate: false });
    }

    // 1) 같은 카테고리의 미처리 신고 조회
    const qRes = await fetch(`${FS}:runQuery?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "reports" }],
          where: {
            compositeFilter: {
              op: "AND",
              filters: [
                { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "OPEN" } } },
                { fieldFilter: { field: { fieldPath: "category" }, op: "EQUAL", value: { stringValue: category } } },
              ],
            },
          },
          limit: 200,
        },
      }),
    });
    const rows = await qRes.json();

    type Candidate = { name: string; imageUrl: string; dist: number; reportCount: number; severity: string };
    const candidates: Candidate[] = rows
      .filter((r: { document?: unknown }) => r.document)
      .map((r: { document: { name: string; fields: Record<string, { stringValue?: string; doubleValue?: number; integerValue?: string }> } }) => {
        const f = r.document.fields;
        return {
          name: r.document.name,
          imageUrl: f.imageUrl?.stringValue ?? "",
          dist: haversine(lat, lng, f.lat?.doubleValue ?? 0, f.lng?.doubleValue ?? 0),
          reportCount: Number(f.reportCount?.integerValue ?? 1),
          severity: f.severity?.stringValue ?? "LOW",
        };
      })
      .filter((c: Candidate) => c.dist <= RADIUS_M && c.imageUrl.startsWith("data:"))
      .sort((a: Candidate, b: Candidate) => a.dist - b.dist)
      .slice(0, MAX_CANDIDATES);

    if (candidates.length === 0) {
      return NextResponse.json({ duplicate: false });
    }

    // 2) Gemini에 새 사진 + 후보 사진들을 주고 동일 위험 여부 비교
    const parts: object[] = [
      { text: "다음은 새로 접수된 도시 위험 신고 사진이다." },
      toPart(imageDataUrl),
      { text: "아래는 근처(60m 이내)에서 이미 접수된 같은 카테고리의 신고 사진들이다." },
    ];
    candidates.forEach((c, i) => {
      parts.push({ text: `[후보 ${i}]` });
      parts.push(toPart(c.imageUrl));
    });
    parts.push({
      text: `새 사진이 후보 중 하나와 '물리적으로 동일한 위험 요소'(같은 포트홀, 같은 파손 지점, 같은 투기 장소)를 찍은 것인지 판별하라.
촬영 각도/거리/시간대가 달라도 같은 대상이면 동일로 판단한다.
동일한 후보가 있으면 그 번호를, 없으면 -1을 matchIndex로 반환하라.`,
    });

    const result = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { matchIndex: { type: Type.INTEGER } },
          required: ["matchIndex"],
        },
      },
    });

    const { matchIndex } = JSON.parse(result.text ?? '{"matchIndex":-1}');
    if (matchIndex < 0 || matchIndex >= candidates.length) {
      return NextResponse.json({ duplicate: false });
    }

    // 3) 중복 확정 → 기존 문서의 신고 횟수 +1 (심각도는 더 높은 쪽 유지)
    const matched = candidates[matchIndex];
    const newCount = matched.reportCount + 1;
    const sevRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    const finalSeverity =
      (sevRank[severity] ?? 0) > (sevRank[matched.severity] ?? 0)
        ? severity
        : matched.severity;

    await fetch(
      `https://firestore.googleapis.com/v1/${matched.name}?key=${API_KEY}&updateMask.fieldPaths=reportCount&updateMask.fieldPaths=severity`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            reportCount: { integerValue: String(newCount) },
            severity: { stringValue: finalSeverity },
          },
        }),
      }
    );

    const reportId = matched.name.split("/").pop();
    return NextResponse.json({ duplicate: true, reportId, reportCount: newCount });
  } catch (e) {
    // 중복 판별이 실패해도 신고 자체는 진행되어야 하므로 조용히 false 반환
    console.error("dedup error:", e);
    return NextResponse.json({ duplicate: false });
  }
}
