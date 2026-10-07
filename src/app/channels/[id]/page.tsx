import { notFound } from "next/navigation";
import { ChannelView } from "@/components/ChannelView";
import { CHANNEL_IDS } from "@/lib/types";
import type { ChannelId } from "@/lib/types";

export function generateStaticParams() {
  return CHANNEL_IDS.map((id) => ({ id }));
}

export default async function ChannelPage({ params }: PageProps<"/channels/[id]">) {
  const { id } = await params;
  if (!(CHANNEL_IDS as readonly string[]).includes(id)) notFound();
  return <ChannelView id={id as ChannelId} />;
}
