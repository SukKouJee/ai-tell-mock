/**
 * Next.js API Route for MCP Gateway Chat Threads List
 *
 * 이 파일을 복사해서 사용:
 * apps/web/app/api/chat/threads/route.ts
 */
import { NextResponse } from 'next/server';

const MCP_GATEWAY_URL = process.env.MCP_GATEWAY_URL || 'http://localhost:8080';

// GET /api/chat/threads - List all threads
export async function GET() {
  try {
    const response = await fetch(`${MCP_GATEWAY_URL}/chat/threads`);

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { success: false, error: `Gateway error: ${response.status} - ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
