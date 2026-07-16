"use client";

import { useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  AnalysisResult,
  Category,
  Severity,
  CATEGORY_LABEL,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
} from "@/lib/report";

type Phase = "idle" | "analyzing" | "editing" | "done" | "none" | "error";

interface TempReport {
  category: Category;
  severity: Severity;
  description: string;
  lat: number;
  lng: number;
  address: string;
  imageUrl: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
    const data = await res.json();
    return data.address ?? "주소를 찾을 수 없음";
  } catch {
    return "주소를 찾을 수 없음";
  }
}

// Firestore 문서 1MB 제한에 맞춰 이미지를 리사이즈해 base64 data URL로 변환
// (Firebase Storage 미사용 — 조직 정책상 Firebase 등록 불가)
async function toCompressedDataUrl(file: File, maxSize = 800): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.6);
}

// 위치 획득: GPS → EXIF 순서로 시도, 둘 다 실패하면 null (사용자 직접 입력 유도)
async function getLocation(
  file: File
): Promise<{ lat: number; lng: number } | null> {
  // 1순위: 브라우저 Geolocation (현재 위치)
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 5000,
        enableHighAccuracy: true,
      })
    );
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    // 2순위 폴백: 사진 EXIF GPS 태그
    try {
      const exifr = (await import("exifr")).default;
      const gps = await exifr.gps(file);
      if (gps?.latitude && gps?.longitude) {
        return { lat: gps.latitude, lng: gps.longitude };
      }
    } catch {}
    return null;
  }
}

export default function ReportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [tempReport, setTempReport] = useState<TempReport | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressError, setAddressError] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // 주소 직접 입력 → 정방향 지오코딩으로 좌표 확정
  async function searchAddress() {
    if (!addressQuery.trim()) return;
    setIsSearching(true);
    setAddressError("");
    try {
      const res = await fetch(
        `/api/geocode?address=${encodeURIComponent(addressQuery)}`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTempReport((prev) =>
        prev
          ? { ...prev, address: data.address, lat: data.lat, lng: data.lng }
          : prev
      );
      setEditingAddress(false);
      setAddressQuery("");
    } catch {
      setAddressError("주소를 찾을 수 없어요. 다시 입력해 주세요.");
    } finally {
      setIsSearching(false);
    }
  }

  async function handleFile(file: File) {
    setPhase("analyzing");
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setTempReport(null);

    try {
      // 위치 획득과 AI 분석을 병렬 수행
      const formData = new FormData();
      formData.append("image", file);
      const [location, res] = await Promise.all([
        getLocation(file),
        fetch("/api/analyze", { method: "POST", body: formData }),
      ]);

      if (!res.ok) throw new Error("analyze failed");
      const analysis: AnalysisResult = await res.json();
      setResult(analysis);

      if (analysis.category === "NONE") {
        setPhase("none");
        return;
      }

      const [imageUrl, address] = await Promise.all([
        toCompressedDataUrl(file),
        location ? reverseGeocode(location.lat, location.lng) : Promise.resolve(""),
      ]);

      setTempReport({
        category: analysis.category,
        severity: analysis.severity,
        description: analysis.description,
        lat: location?.lat ?? 0,
        lng: location?.lng ?? 0,
        address, // ""이면 위치 미확인 → 사용자 직접 입력 필요
        imageUrl,
      });
      setEditingAddress(!location);

      setPhase("editing");
    } catch (e) {
      console.error(e);
      setPhase("error");
    }
  }

  function handleTempChange<K extends keyof TempReport>(key: K, value: TempReport[K]) {
    setTempReport((prev) => {
      if (!prev) return null;
      return { ...prev, [key]: value };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tempReport) return;
    setIsSubmitting(true);

    try {
      const docRef = await addDoc(collection(db, "reports"), {
        category: tempReport.category,
        severity: tempReport.severity,
        description: tempReport.description,
        lat: tempReport.lat,
        lng: tempReport.lng,
        address: tempReport.address,
        imageUrl: tempReport.imageUrl,
        status: "OPEN",
        createdAt: serverTimestamp(),
      });

      // 내 신고 추적: 로그인 없이 localStorage로 신고 ID 보관
      const mine = JSON.parse(localStorage.getItem("myReportIds") ?? "[]");
      localStorage.setItem(
        "myReportIds",
        JSON.stringify([docRef.id, ...mine])
      );

      setResult({
        category: tempReport.category,
        severity: tempReport.severity,
        description: tempReport.description,
      });
      setPhase("done");
    } catch (e) {
      console.error(e);
      setPhase("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function reset() {
    setPhase("idle");
    setPreview(null);
    setResult(null);
    setTempReport(null);
    setEditingAddress(false);
    setAddressQuery("");
    setAddressError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 p-6 text-white">
      <div className="text-center">
        <h1 className="text-3xl font-bold">🔦 SpotLight</h1>
        <p className="mt-2 text-sm text-zinc-400">
          사진 한 장으로 끝나는 위험 신고
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          당신의 사진 한 장이, AI를 만나 더 안전한 도시가 됩니다
        </p>
      </div>

      {preview && phase !== "editing" && (
        <img
          src={preview}
          alt="업로드된 현장 사진"
          className="max-h-64 w-full max-w-sm rounded-xl object-cover"
        />
      )}

      {phase === "idle" && (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full max-w-sm rounded-2xl bg-amber-400 py-16 text-xl font-bold text-black active:scale-95 transition-all"
        >
          📸 위험 요소 촬영하기
        </button>
      )}

      {phase === "analyzing" && (
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" />
          <p className="text-zinc-300">AI가 위험도를 분석하고 있어요…</p>
        </div>
      )}

      {phase === "editing" && tempReport && (
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-md shadow-2xl space-y-5"
        >
          <h2 className="text-xl font-bold text-center border-b border-zinc-800 pb-3 text-zinc-100">
            📝 신고 정보 확인 및 수정
          </h2>

          <div className="flex justify-center">
            <img
              src={tempReport.imageUrl}
              alt="업로드된 현장 사진"
              className="max-h-40 w-full rounded-xl object-cover border border-zinc-800"
            />
          </div>

          {/* 카테고리 선택 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-400">카테고리</label>
            <div className="grid grid-cols-2 gap-2">
              {(["POTHOLE", "BROKEN_FACILITY", "TRASH", "OTHER"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleTempChange("category", cat)}
                  className={`rounded-lg py-2 px-3 text-sm font-medium border transition-all ${
                    tempReport.category === cat
                      ? "bg-amber-400 text-black border-amber-400 font-bold"
                      : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"
                  }`}
                >
                  {CATEGORY_LABEL[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* 심각도: AI 자동 판정 결과 (수정 불가) */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-400">
              심각도 <span className="text-[10px] text-zinc-500">— AI 자동 판정 (수정 불가)</span>
            </label>
            <div
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
              style={{
                borderColor: SEVERITY_COLOR[tempReport.severity],
                backgroundColor: `${SEVERITY_COLOR[tempReport.severity]}22`,
              }}
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: SEVERITY_COLOR[tempReport.severity] }}
              />
              <b style={{ color: SEVERITY_COLOR[tempReport.severity] }}>
                {SEVERITY_LABEL[tempReport.severity]}
              </b>
              <span className="ml-auto text-xs text-zinc-500">🔒</span>
            </div>
          </div>

          {/* 설명 입력 */}
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-semibold text-zinc-400">
              상세 설명 (15자 이내)
            </label>
            <input
              id="description"
              type="text"
              value={tempReport.description}
              onChange={(e) => handleTempChange("description", e.target.value.slice(0, 15))}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
              placeholder="위험 요소를 설명해주세요"
              required
            />
            <p className="text-right text-xs text-zinc-500">
              {tempReport.description.length} / 15자
            </p>
          </div>

          {/* 위치: 도로명주소 표시 + 직접 입력 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-400">신고 위치</label>
            {tempReport.address && !editingAddress ? (
              <div className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-white">📍 {tempReport.address}</p>
                  <button
                    type="button"
                    onClick={() => setEditingAddress(true)}
                    className="shrink-0 text-xs text-amber-400 underline"
                  >
                    수정
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">
                  GPS: {tempReport.lat.toFixed(6)}, {tempReport.lng.toFixed(6)}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {!tempReport.address && (
                  <p className="text-xs text-amber-400">
                    ⚠️ 위치를 자동으로 확인할 수 없어요. 신고 위치의 주소를 직접
                    입력해 주세요.
                  </p>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addressQuery}
                    onChange={(e) => setAddressQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchAddress();
                      }
                    }}
                    placeholder="예) 서울 중구 동호로 249"
                    className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    type="button"
                    onClick={searchAddress}
                    disabled={isSearching}
                    className="rounded-lg bg-zinc-700 px-4 text-sm font-semibold disabled:opacity-50"
                  >
                    {isSearching ? "검색 중…" : "검색"}
                  </button>
                </div>
                {addressError && (
                  <p className="text-xs text-red-400">{addressError}</p>
                )}
              </div>
            )}
          </div>

          {/* 제출 및 취소 버튼 */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={reset}
              className="flex-1 rounded-xl bg-zinc-800 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-700 active:scale-95 transition-all"
            >
              취소 및 재촬영
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !tempReport.address}
              className="flex-1 rounded-xl bg-amber-400 py-3 text-sm font-bold text-black hover:bg-amber-300 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
            >
              {isSubmitting
                ? "제출 중..."
                : !tempReport.address
                ? "위치를 입력해 주세요"
                : "신고 제출하기"}
            </button>
          </div>
        </form>
      )}

      {phase === "done" && result && (
        <div className="w-full max-w-sm rounded-2xl bg-zinc-800 p-5 text-center">
          <p className="text-lg font-bold text-amber-400">✅ 신고 완료!</p>
          <div className="mt-3 space-y-1 text-sm">
            <p>
              분류: <b>{CATEGORY_LABEL[result.category]}</b>
            </p>
            <p>
              심각도:{" "}
              <b style={{ color: SEVERITY_COLOR[result.severity] }}>
                {SEVERITY_LABEL[result.severity]}
              </b>
            </p>
            <p className="text-zinc-300">{result.description}</p>
          </div>
          <p className="mt-4 border-t border-zinc-700 pt-3 text-xs text-zinc-400">
            🌱 방금 이 동네가 조금 더 안전해졌어요.
            <br />
            신고 내용은 관제 지도에 실시간으로 전달되었습니다.
          </p>
        </div>
      )}

      {phase === "none" && (
        <div className="w-full max-w-sm rounded-2xl bg-zinc-800 p-5 text-center">
          <p className="text-lg font-bold">🙅 위험 요소가 발견되지 않았어요</p>
          <p className="mt-2 text-sm text-zinc-400">
            도로·시설물 등 위험 현장이 잘 보이게 다시 촬영해 주세요.
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="w-full max-w-sm rounded-2xl bg-red-900/50 p-5 text-center">
          <p className="font-bold">⚠️ 처리 중 오류가 발생했어요</p>
          <p className="mt-1 text-sm text-zinc-300">다시 시도해 주세요.</p>
        </div>
      )}

      {phase !== "idle" && phase !== "analyzing" && phase !== "editing" && (
        <button
          onClick={reset}
          className="w-full max-w-sm rounded-xl bg-zinc-700 py-3 font-semibold active:scale-95"
        >
          새로 신고하기
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      <div className="flex gap-4">
        <a href="/my" className="text-xs text-amber-400/80 underline">
          📋 내 신고 내역
        </a>
        <a href="/dashboard" className="text-xs text-zinc-500 underline">
          관제 대시보드 →
        </a>
      </div>
    </main>
  );
}
