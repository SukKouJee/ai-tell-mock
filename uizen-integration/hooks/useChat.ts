/**
 * useChat Hook - MCP Gateway Chat Integration (Thread-based)
 *
 * 이 파일을 복사해서 사용:
 * packages/shared/hooks/useChat.ts
 *
 * 그리고 packages/shared/hooks/index.ts에 export 추가:
 * export * from './useChat';
 */
import { useCallback, useState, useEffect } from 'react';
import { useChatStore } from '../stores/useChatStore';

interface ChatContext {
  page?: string;
  filters?: Record<string, unknown>;
  selectedRows?: unknown[];
  allRows?: unknown[];
  totalCount?: number;
  [key: string]: unknown;
}

interface UseChatOptions {
  threadId?: string;
  gatewayUrl?: string;
  autoLoad?: boolean; // Auto-load thread messages on mount
}

interface ToolCall {
  name: string;
  result: unknown;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: string;
}

interface ChatResponse {
  success: boolean;
  threadId: string;
  messageId: string;
  message: string;
  toolCalls?: ToolCall[];
  error?: string;
}

interface ThreadMessagesResponse {
  success: boolean;
  threadId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

interface ThreadStatusResponse {
  enabled: boolean;
  model: string;
  tools: string[];
  thread: {
    id: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
  } | null;
}

// Generate unique thread ID
function generateThreadId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function useChat(options: UseChatOptions = {}) {
  const {
    threadId: initialThreadId,
    gatewayUrl = 'http://localhost:8080',
    autoLoad = false,
  } = options;

  // Use provided threadId or generate a new one
  const [threadId] = useState(() => initialThreadId || generateThreadId());
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadStatus, setThreadStatus] = useState<ThreadStatusResponse | null>(null);

  const {
    messages,
    addMessage,
    appendToMessage,
    setMessages,
    clearMessages,
  } = useChatStore();

  // Get messages for this thread
  const threadMessages = messages.filter(m => m.threadId === threadId);

  // Fetch thread messages from server
  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${gatewayUrl}/chat/${threadId}/messages`);

      if (response.status === 404) {
        // Thread doesn't exist yet, that's OK
        return;
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: ThreadMessagesResponse = await response.json();

      if (data.success && data.messages) {
        // Convert server messages to store format
        const storeMessages = data.messages.map(m => ({
          id: m.id,
          threadId,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.timestamp,
        }));
        setMessages(threadId, storeMessages);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [threadId, gatewayUrl, setMessages]);

  // Fetch thread status
  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch(`${gatewayUrl}/chat/${threadId}/status`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: ThreadStatusResponse = await response.json();
      setThreadStatus(data);
    } catch (err) {
      console.error('Failed to load thread status:', err);
    }
  }, [threadId, gatewayUrl]);

  // Auto-load messages on mount if enabled
  useEffect(() => {
    if (autoLoad) {
      loadMessages();
      loadStatus();
    }
  }, [autoLoad, loadMessages, loadStatus]);

  // Send message using thread-based API
  const sendMessage = useCallback(async (
    content: string,
    context?: ChatContext
  ) => {
    if (!content.trim()) return;

    setError(null);
    setIsStreaming(true);

    // Add user message to store (optimistic update)
    const userMsgId = `user-${Date.now()}`;
    addMessage({
      id: userMsgId,
      threadId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    });

    // Prepare assistant message placeholder
    const assistantMsgId = `assistant-${Date.now()}`;
    addMessage({
      id: assistantMsgId,
      threadId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    });

    try {
      // Use thread-based endpoint: POST /chat/:threadId/messages
      const response = await fetch(`${gatewayUrl}/chat/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          context,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: ChatResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      // Build response content with tool calls if any
      let responseContent = data.message || '';

      if (data.toolCalls && data.toolCalls.length > 0) {
        responseContent += '\n\n---\n**실행된 도구:**\n';
        for (const tc of data.toolCalls) {
          responseContent += `\n- \`${tc.name}\``;
        }
      }

      // Update assistant message
      appendToMessage(assistantMsgId, responseContent);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      appendToMessage(assistantMsgId, `오류가 발생했습니다: ${errorMsg}`);
    } finally {
      setIsStreaming(false);
    }
  }, [threadId, gatewayUrl, addMessage, appendToMessage]);

  // Clear chat (local only)
  const clearChat = useCallback(() => {
    clearMessages(threadId);
    setError(null);
  }, [threadId, clearMessages]);

  // Delete thread from server
  const deleteThread = useCallback(async () => {
    try {
      const response = await fetch(`${gatewayUrl}/chat/${threadId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      clearMessages(threadId);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
    }
  }, [threadId, gatewayUrl, clearMessages]);

  return {
    threadId,
    messages: threadMessages,
    sendMessage,
    clearChat,
    deleteThread,
    loadMessages,
    loadStatus,
    isStreaming,
    isLoading,
    error,
    threadStatus,
  };
}

export type { ChatContext, UseChatOptions, ChatMessage, ToolCall };
