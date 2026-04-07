import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

function backendV1Base(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_URL ||
    "https://prisere-backend.onrender.com/v1";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return NextResponse.json(
        { detail: "Unauthorized" },
        { status: 401 }
      );
    }

    const headerAuth = request.headers.get("authorization");
    const bearerFromClient =
      headerAuth?.startsWith("Bearer ") ? headerAuth.slice(7) : null;
    const token = bearerFromClient ?? (await getToken());
    const body = await request.json();

    const res = await fetch(`${backendV1Base()}/auth/me/risk-profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("risk-profile proxy error:", error);
    return NextResponse.json(
      { detail: "Failed to update risk profile" },
      { status: 500 }
    );
  }
}
