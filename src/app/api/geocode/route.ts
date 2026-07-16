import { NextRequest, NextResponse } from "next/server";

// 지오코딩 프록시 (Geocoding 웹 서비스는 브라우저 CORS가 막혀 있어 서버에서 호출)
// - lat + lng → 한국어 도로명주소 (역방향)
// - address   → 좌표 + 정규화된 주소 (정방향, 위치 직접 입력용)
export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");
  const address = req.nextUrl.searchParams.get("address");
  const key = process.env.NEXT_PUBLIC_MAPS_API_KEY;

  try {
    if (address) {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address
      )}&language=ko&region=kr&key=${key}`;
      const data = await (await fetch(url)).json();
      const r = data.results?.[0];
      if (!r) {
        return NextResponse.json(
          { error: "주소를 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      return NextResponse.json({
        address: r.formatted_address.replace(/^대한민국\s*/, ""),
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
      });
    }

    if (lat && lng) {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ko&key=${key}`;
      const data = await (await fetch(url)).json();
      const formatted: string | undefined = data.results?.[0]?.formatted_address;
      return NextResponse.json({
        address: formatted
          ? formatted.replace(/^대한민국\s*/, "")
          : "주소를 찾을 수 없음",
      });
    }

    return NextResponse.json(
      { error: "lat+lng 또는 address가 필요합니다." },
      { status: 400 }
    );
  } catch (e) {
    console.error("geocode error:", e);
    return NextResponse.json({ error: "지오코딩 실패" }, { status: 500 });
  }
}
