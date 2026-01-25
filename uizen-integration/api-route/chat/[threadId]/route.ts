/**
 * Next.js API Route for MCP Gateway Chat Thread Management
 *
 * 이 파일을 복사해서 사용:
 * apps/web/app/api/chat/[threadId]/route.ts
 */
import { NextRequest, NextResponse } from 'next/server';

const MCP_GATEWAY_URL = process.env.MCP_GATEWAY_URL || 'http://localhost:8080';

// GET /api/chat/:threadId - Get thread status
export async function GET(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const { threadId } = params;

    const response = await fetch(`${MCP_GATEWAY_URL}/chat/${threadId}/status`);

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

// DELETE /api/chat/:threadId - Delete thread
export async function DELETE(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const { threadId } = params;

    const response = await fetch(`${MCP_GATEWAY_URL}/chat/${threadId}`, {
      method: 'DELETE',
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
