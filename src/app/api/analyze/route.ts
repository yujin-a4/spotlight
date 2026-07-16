import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `너는 도시 인프라 위험도를 판별하는 안전 전문가 시스템이다.
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
4. suggestedAction: 현장 조치 방안을 한국어 30자 이내로 구체적으로 제시.
5. department: 처리 담당 부서. "도로관리과"(도로/포트홀), "환경미화과"(쓰레기), "시설관리과"(시설물), "기타" 중 선택.
6. riskNote: 방치할 경우의 위험을 한국어 30자 이내로 서술.
   - category가 NONE이면 suggestedAction과 riskNote는 "해당 없음", department는 "기타".

[예시]
- 깊은 포트홀 사진 → {"category":"POTHOLE","severity":"HIGH","description":"차도 대형 포트홀 발생","suggestedAction":"아스팔트 긴급 패칭, 임시 안전콘 설치 권장","department":"도로관리과","riskNote":"차량 타이어 파손 및 이륜차 전도 우려"}
- 카페 음료 사진 → {"category":"NONE","severity":"LOW","description":"위험 요소 없음","suggestedAction":"해당 없음","department":"기타","riskNote":"해당 없음"}`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      enum: ["POTHOLE", "BROKEN_FACILITY", "TRASH", "OTHER", "NONE"],
    },
    severity: {
      type: Type.STRING,
      enum: ["HIGH", "MEDIUM", "LOW"],
    },
    description: { type: Type.STRING },
    suggestedAction: { type: Type.STRING },
    department: {
      type: Type.STRING,
      enum: ["도로관리과", "환경미화과", "시설관리과", "기타"],
    },
    riskNote: { type: Type.STRING },
  },
  required: ["category", "severity", "description", "suggestedAction", "department", "riskNote"],
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) {
      return NextResponse.json({ error: "image 파일이 필요합니다." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");

    const result = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: file.type || "image/jpeg", data: bytes } },
            { text: SYSTEM_PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    const analysis = JSON.parse(result.text ?? "{}");
    return NextResponse.json(analysis);
  } catch (e) {
    console.error("analyze error:", e);
    return NextResponse.json({ error: "AI 분석에 실패했습니다." }, { status: 500 });
  }
}
