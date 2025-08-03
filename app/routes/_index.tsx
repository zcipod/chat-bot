import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { ChatDialogue } from "~/components/chat-dialogue";

import { createChatStream } from '~/services/chat.server';
import { getAvailableModels } from '~/services/models.server';

export const meta: MetaFunction = () => {
  return [
    { title: "Chat Bot" },
    { name: "description", content: "A smart chat bot!" },
  ];
};

export async function loader() {
  const models = await getAvailableModels();
  return Response.json({ models });
}

export async function action({ request }: ActionFunctionArgs) {
  // console.log('Action function called');
  // console.log('Request method:', request.method);

  const { messages, model } = await request.json();
  const stream = await createChatStream({ messages, model });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

export default function Index() {
  const { models } = useLoaderData<typeof loader>();

  return <ChatDialogue models={models} />;
}
