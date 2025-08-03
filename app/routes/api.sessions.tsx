import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "~/services/db.server";

// GET /api/sessions - Get all chat sessions
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const sessions = await prisma.chatSession.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return json({ sessions });
  } catch (error) {
    console.error('Failed to load sessions:', error);
    return json({ error: 'Failed to load sessions' }, { status: 500 });
  }
}

// POST /api/sessions - Create a new chat session
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { title } = await request.json();
    
    const session = await prisma.chatSession.create({
      data: {
        title: title || 'New Chat',
      },
    });

    return json({ session });
  } catch (error) {
    console.error('Failed to create session:', error);
    return json({ error: 'Failed to create session' }, { status: 500 });
  }
}
