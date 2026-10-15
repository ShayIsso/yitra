import { NextResponse } from "next/server";
import { expiredSessionCookie } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(expiredSessionCookie());
  return res;
}
