import type { ActionFunctionArgs } from "@remix-run/node";
import { createChatStream } from '~/services/chat.server';

export async function action({ request }: ActionFunctionArgs) {
  console.log('Chat API action function called');
  console.log('Request method:', request.method);

  const { messages, model, sessionId } = await request.json();
  const stream = await createChatStream({ messages, model, sessionId });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
