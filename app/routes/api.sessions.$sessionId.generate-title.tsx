import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { openaiClient } from "~/services/openai.server";
import { prisma } from "~/services/db.server";
import { getTitleGenerator } from "~/services/models.server";

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const { sessionId } = params;
  
  if (!sessionId) {
    return json({ error: 'Session ID is required' }, { status: 400 });
  }

  try {
    // Get the first few messages from the session
    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 4, // First 2 exchanges (user + assistant)
      select: {
        role: true,
        content: true,
      },
    });

    if (messages.length < 2) {
      return json({ error: 'Not enough messages to generate title' }, { status: 400 });
    }

    // Create a prompt for title generation
    const conversationText = messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    const titlePrompt = `Based on the following conversation, generate a concise, descriptive title (maximum 50 characters) that captures the main topic or question:

${conversationText}

Title:`;

    // Get the title generator model
    const titleModel = await getTitleGenerator();
    // Call OpenAI to generate title
    const response = await openaiClient.chat.completions.create({
      model: titleModel.id,
      messages: [
        {
          role: 'user',
          content: titlePrompt,
        },
      ],
      max_tokens: 20,
      temperature: 0.7,
    });

    const generatedTitle = response.choices[0]?.message?.content?.trim();
    
    if (!generatedTitle) {
      return json({ error: 'Failed to generate title' }, { status: 500 });
    }

    // Clean up the title (remove quotes if present)
    const cleanTitle = generatedTitle.replace(/^["']|["']$/g, '').substring(0, 50);

    // Update the session title
    const updatedSession = await prisma.chatSession.update({
      where: { id: sessionId },
      data: { title: cleanTitle },
    });

    return json({ title: cleanTitle, session: updatedSession });
  } catch (error) {
    console.error('Failed to generate title:', error);
    return json({ error: 'Failed to generate title' }, { status: 500 });
  }
}
