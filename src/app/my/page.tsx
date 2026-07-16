"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  CATEGORY_LABEL,
  Report,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
} from "@/lib/report";

// 내 신고 추적 페이지: localStorage의 신고 ID로 실시간 상태 구독
// (공무원이 대시보드에서 "처리 완료"를 누르면 여기에도 즉시 반영된다)
export default function MyReportsPage() {
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const myIds: string[] = JSON.parse(
      localStorage.getItem("myReportIds") ?? "[]"
    );
    setIds(myIds);

    const unsubs = myIds.map((id) =>
      onSnapshot(doc(db, "reports", id), (snap) => {
        if (!snap.exists()) return;
        setReports((prev) => ({
          ...prev,
          [id]: { id, ...snap.data() } as Report,
        }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  const list = ids.map((id) => reports[id]).filter(Boolean);
  const resolvedCount = list.filter((r) => r.status === "RESOLVED").length;

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <div className="mx-auto max-w-sm space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-bold">📋 내 신고 내역</h1>
        </div>

        {/* 임팩트 스탯 */}
        <div className="rounded-2xl bg-gradient-to-br from-amber-400/20 to-emerald-400/10 border border-amber-400/30 p-4 text-center">
          <p className="text-sm text-zinc-300">
            지금까지 <b className="text-amber-400">{ids.length}건</b>을 신고했고,
            그중 <b className="text-emerald-400">{resolvedCount}건</b>이
            해결됐어요.
          </p>
          {resolvedCount > 0 && (
            <p className="mt-2 text-xs text-zinc-400">
              🌱 당신 덕분에 우리 동네가 {resolvedCount}번 더 안전해졌습니다.
            </p>
          )}
        </div>

        {ids.length === 0 && (
          <p className="text-center text-sm text-zinc-500">
            아직 신고 내역이 없어요.
            <br />
            길에서 발견한 위험을 사진 한 장으로 알려주세요!
          </p>
        )}

        {list.map((r) => (
          <div key={r.id} className="rounded-xl bg-zinc-800 p-3">
            <div className="flex gap-3">
              <img
                src={r.imageUrl}
                alt={r.description}
                className="h-16 w-16 rounded-lg object-cover"
              />
              <div className="flex-1 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ background: SEVERITY_COLOR[r.severity] }}
                  />
                  <b>{CATEGORY_LABEL[r.category]}</b>
                  <span className="text-xs text-zinc-400">
                    {SEVERITY_LABEL[r.severity]}
                  </span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      r.status === "RESOLVED"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {r.status === "RESOLVED" ? "✅ 처리 완료" : "⏳ 접수됨"}
                  </span>
                </div>
                <p className="mt-1 text-zinc-300">{r.description}</p>
                {r.address && (
                  <p className="mt-1 text-xs text-zinc-500">📍 {r.address}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="text-center">
          <a href="/" className="text-xs text-zinc-500 underline">
            ← 새로 신고하기
          </a>
        </div>
      </div>
    </main>
  );
}
