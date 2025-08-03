import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "~/services/db.server";

// GET /api/sessions/:sessionId/messages - Get messages for a session
export async function loader({ params }: LoaderFunctionArgs) {
  const { sessionId } = params;
  
  if (!sessionId) {
    return json({ error: 'Session ID is required' }, { status: 400 });
  }

  try {
    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    // Transform messages to match frontend format
    const transformedMessages = messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      toolName: msg.toolName,
      toolArgs: msg.toolArgs ? JSON.parse(msg.toolArgs) : undefined,
      toolResult: msg.toolResult ? JSON.parse(msg.toolResult) : undefined,
      isCollapsed: msg.isCollapsed,
      createdAt: msg.createdAt.toISOString(),
    }));

    return json({ messages: transformedMessages });
  } catch (error) {
    console.error('Failed to load messages:', error);
    return json({ error: 'Failed to load messages' }, { status: 500 });
  }
}
