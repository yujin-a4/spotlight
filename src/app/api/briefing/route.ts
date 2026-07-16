import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

// 미처리 신고 전체를 Gemini가 분석해 관제용 우선순위 브리핑을 생성
export async function POST() {
  try {
    // Firestore REST로 OPEN 신고 조회 (서버 사이드)
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "reports" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "status" },
                op: "EQUAL",
                value: { stringValue: "OPEN" },
              },
            },
            limit: 100,
          },
        }),
      }
    );
    const rows = await res.json();
    const reports = rows
      .filter((r: { document?: unknown }) => r.document)
      .map((r: { document: { fields: Record<string, { stringValue?: string; doubleValue?: number }> } }) => {
        const f = r.document.fields;
        return {
          category: f.category?.stringValue,
          severity: f.severity?.stringValue,
          description: f.description?.stringValue,
          address: f.address?.stringValue ?? "",
          lat: f.lat?.doubleValue,
          lng: f.lng?.doubleValue,
        };
      });

    if (reports.length === 0) {
      return NextResponse.json({ briefing: "현재 미처리 신고가 없습니다." });
    }

    const prompt = `너는 지자체 도시안전 관제센터의 AI 분석관이다.
아래는 현재 미처리 상태인 시민 신고 데이터(JSON)다.
좌표가 가까운 신고들의 밀집(클러스터) 패턴, 심각도 분포를 분석하여
현장 대응 인력을 위한 브리핑을 한국어로 작성하라.

형식:
📊 현황 요약: (1~2문장)
🚨 우선 대응 권고: (밀집 지역/심각도 기준 Top 3, 각 1~2문장, 지역명과 건수 명시)
💡 패턴 분석: (반복 발생 유형이나 추정 원인, 1~2문장)

전체 400자 이내. 과장 없이 데이터에 근거해서만 작성.

[신고 데이터]
${JSON.stringify(reports)}`;

    const result = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
    });

    return NextResponse.json({
      briefing: result.text ?? "브리핑 생성에 실패했습니다.",
      reportCount: reports.length,
    });
  } catch (e) {
    console.error("briefing error:", e);
    return NextResponse.json(
      { error: "브리핑 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
