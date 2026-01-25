/**
 * Next.js API Route for MCP Gateway Chat (Thread-based)
 *
 * 이 파일을 복사해서 사용:
 * apps/web/app/api/chat/[threadId]/messages/route.ts
 */
import { NextRequest, NextResponse } from 'next/server';

const MCP_GATEWAY_URL = process.env.MCP_GATEWAY_URL || 'http://localhost:8080';

export async function POST(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const { threadId } = params;
    const body = await request.json();

    // Forward to MCP Gateway thread-based endpoint
    const response = await fetch(`${MCP_GATEWAY_URL}/chat/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

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

export async function GET(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const { threadId } = params;

    // Get thread messages from MCP Gateway
    const response = await fetch(`${MCP_GATEWAY_URL}/chat/${threadId}/messages`);

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
