"use client";

/* global google */

import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  CATEGORY_LABEL,
  Report,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  SEVERITY_WEIGHT,
} from "@/lib/report";

declare global {
  interface Window {
    google: typeof google;
    __mapsLoaded?: () => void;
  }
}

type ViewMode = "heatmap" | "marker";

export default function DashboardPage() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [mode, setMode] = useState<ViewMode>("heatmap");
  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState<Report | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  async function generateBriefing() {
    setBriefingLoading(true);
    try {
      const res = await fetch("/api/briefing", { method: "POST" });
      const data = await res.json();
      setBriefing(data.briefing ?? data.error);
    } catch {
      setBriefing("브리핑 생성에 실패했습니다.");
    } finally {
      setBriefingLoading(false);
    }
  }

  // 1) Google Maps 스크립트 로드 + 맵 초기화
  useEffect(() => {
    function initMap() {
      if (!mapDivRef.current || mapRef.current) return;
      mapRef.current = new window.google.maps.Map(mapDivRef.current, {
        center: { lat: 37.5665, lng: 126.978 },
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
      });
      setMapReady(true);
    }

    if (window.google?.maps) {
      initMap();
      return;
    }
    window.__mapsLoaded = initMap;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_MAPS_API_KEY}&callback=__mapsLoaded`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // 2) Firestore 실시간 구독 (미처리 신고만)
  useEffect(() => {
    const q = query(
      collection(db, "reports"),
      where("status", "==", "OPEN"),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setReports(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report))
      );
    });
  }, []);

  // 3) 지도에 마커/히트맵 렌더링
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];

    for (const r of reports) {
      if (mode === "marker") {
        const marker = new window.google.maps.Marker({
          map,
          position: { lat: r.lat, lng: r.lng },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: SEVERITY_COLOR[r.severity],
            fillOpacity: 0.95,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => setSelected(r));
        markersRef.current.push(marker);
      } else {
        // 히트맵: 심각도 가중치에 비례한 반투명 원 레이어
        const weight = SEVERITY_WEIGHT[r.severity];
        for (let i = weight; i >= 1; i--) {
          circlesRef.current.push(
            new window.google.maps.Circle({
              map,
              center: { lat: r.lat, lng: r.lng },
              radius: 60 * i,
              fillColor: SEVERITY_COLOR[r.severity],
              fillOpacity: 0.18,
              strokeWeight: 0,
              clickable: false,
            })
          );
        }
      }
    }
  }, [reports, mode, mapReady]);

  function focusReport(r: Report) {
    setSelected(r);
    mapRef.current?.panTo({ lat: r.lat, lng: r.lng });
    mapRef.current?.setZoom(17);
  }

  async function resolveReport(r: Report) {
    await updateDoc(doc(db, "reports", r.id), { status: "RESOLVED" });
    setSelected(null);
  }

  return (
    <main className="flex h-screen bg-zinc-900 text-white">
      {/* 지도 영역 */}
      <div className="relative flex-1">
        <div ref={mapDivRef} className="h-full w-full" />
        <div className="absolute left-4 top-4 flex gap-2 rounded-xl bg-zinc-900/90 p-2">
          <span className="px-2 py-1 font-bold">🔦 SpotLight 관제</span>
          <button
            onClick={() => setMode("heatmap")}
            className={`rounded-lg px-3 py-1 text-sm ${
              mode === "heatmap" ? "bg-amber-400 text-black" : "bg-zinc-700"
            }`}
          >
            히트맵
          </button>
          <button
            onClick={() => setMode("marker")}
            className={`rounded-lg px-3 py-1 text-sm ${
              mode === "marker" ? "bg-amber-400 text-black" : "bg-zinc-700"
            }`}
          >
            마커
          </button>
        </div>
      </div>

      {/* 신고 리스트 */}
      <aside className="flex w-96 flex-col gap-3 overflow-y-auto p-4">
        <h2 className="text-lg font-bold">
          실시간 신고 <span className="text-amber-400">{reports.length}</span>건
        </h2>

        {/* AI 관제 브리핑 */}
        <button
          onClick={generateBriefing}
          disabled={briefingLoading}
          className="rounded-xl bg-indigo-500 py-2.5 font-bold text-white hover:bg-indigo-400 active:scale-95 transition-all disabled:opacity-60"
        >
          {briefingLoading ? "Gemini가 분석 중…" : "🤖 AI 관제 브리핑 생성"}
        </button>
        {briefing && (
          <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/40 p-3 text-sm leading-relaxed whitespace-pre-wrap">
            {briefing}
          </div>
        )}

        {reports.length === 0 && (
          <p className="text-sm text-zinc-500">아직 접수된 신고가 없습니다.</p>
        )}

        {reports.map((r) => (
          <div
            key={r.id}
            onClick={() => focusReport(r)}
            className={`cursor-pointer rounded-xl bg-zinc-800 p-3 transition hover:bg-zinc-700 ${
              selected?.id === r.id ? "ring-2 ring-amber-400" : ""
            }`}
          >
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
                  <span className="text-zinc-400">
                    심각도 {SEVERITY_LABEL[r.severity]}
                  </span>
                </div>
                <p className="mt-1 text-zinc-300">{r.description}</p>
                {r.address && (
                  <p className="mt-1 text-xs text-zinc-500">📍 {r.address}</p>
                )}
              </div>
            </div>
            {selected?.id === r.id && (
              <div className="mt-3 space-y-2">
                <img
                  src={r.imageUrl}
                  alt="현장 사진 확대"
                  className="w-full rounded-lg"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    resolveReport(r);
                  }}
                  className="w-full rounded-lg bg-emerald-500 py-2 font-bold text-black active:scale-95"
                >
                  ✅ 처리 완료
                </button>
              </div>
            )}
          </div>
        ))}
      </aside>
    </main>
  );
}
