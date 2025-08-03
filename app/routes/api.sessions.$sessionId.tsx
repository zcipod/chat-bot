import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "~/services/db.server";

// GET /api/sessions/:sessionId - Get a specific session
export async function loader({ params }: LoaderFunctionArgs) {
  const { sessionId } = params;
  
  if (!sessionId) {
    return json({ error: 'Session ID is required' }, { status: 400 });
  }

  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return json({ error: 'Session not found' }, { status: 404 });
    }

    return json({ session });
  } catch (error) {
    console.error('Failed to load session:', error);
    return json({ error: 'Failed to load session' }, { status: 500 });
  }
}

// PATCH /api/sessions/:sessionId - Update session (e.g., title)
// DELETE /api/sessions/:sessionId - Delete session
export async function action({ request, params }: ActionFunctionArgs) {
  const { sessionId } = params;
  
  if (!sessionId) {
    return json({ error: 'Session ID is required' }, { status: 400 });
  }

  try {
    if (request.method === 'PATCH') {
      const { title } = await request.json();
      
      const session = await prisma.chatSession.update({
        where: { id: sessionId },
        data: { title },
      });

      return json({ session });
      
    } else if (request.method === 'DELETE') {
      await prisma.chatSession.delete({
        where: { id: sessionId },
      });

      return json({ success: true });
      
    } else {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }
  } catch (error) {
    console.error('Failed to update/delete session:', error);
    return json({ error: 'Failed to update/delete session' }, { status: 500 });
  }
}
