import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TARGET_GROUPS = /\b(esporte|sports|canais?\s*vip|vip|premiere|espn|sportv|combate|fox\s*sports|star\s*sports)\b/i;

/**
 * Parse M3U to extract live TV channel names from target groups.
 */
function parseChannelNames(content: string): { name: string; group: string }[] {
  const channels: { name: string; group: string }[] = [];
  const lines = content.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("#EXTINF:")) continue;

    const groupMatch = trimmed.match(/group-title="([^"]+)"/);
    const group = groupMatch ? groupMatch[1] : "";

    if (!TARGET_GROUPS.test(group)) continue;

    let name = "";
    const tvgMatch = trimmed.match(/tvg-name="([^"]+)"/);
    if (tvgMatch) {
      name = tvgMatch[1].trim();
    } else {
      const commaIdx = trimmed.lastIndexOf(",");
      if (commaIdx !== -1) name = trimmed.substring(commaIdx + 1).trim();
    }

    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      channels.push({ name, group });
    }
  }

  return channels;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // GET: return all channels with votes
    if (req.method === "GET") {
      const { data } = await supabase
        .from("canal_status")
        .select("*")
        .order("votes_up", { ascending: false });

      return new Response(
        JSON.stringify({ channels: data || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: vote or seed channels
    if (req.method === "POST") {
      const body = await req.json();

      // Seed channels from M3U
      if (body.action === "seed") {
        const { data: catalog } = await supabase
          .from("m3u_catalog")
          .select("source_url")
          .eq("id", "00000000-0000-0000-0000-000000000001")
          .maybeSingle();

        if (!catalog?.source_url) {
          return new Response(
            JSON.stringify({ error: "No M3U source configured" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log("[Votes] Fetching M3U for seeding...");
        const m3uRes = await fetch(catalog.source_url, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!m3uRes.ok) throw new Error("Failed to fetch M3U: " + m3uRes.status);
        const m3uContent = await m3uRes.text();

        const channels = parseChannelNames(m3uContent);
        console.log("[Votes] Found " + channels.length + " channels in target groups");

        // Upsert channels (don't reset votes for existing ones)
        for (const ch of channels) {
          await supabase.from("canal_status").upsert(
            {
              channel_name: ch.name,
              channel_group: ch.group,
            },
            { onConflict: "channel_name", ignoreDuplicates: true }
          );
        }

        return new Response(
          JSON.stringify({ success: true, seeded: channels.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Vote on a channel
      if (body.action === "vote") {
        const { channel_name, vote_type } = body;
        if (!channel_name || !["up", "down"].includes(vote_type)) {
          return new Response(
            JSON.stringify({ error: "Invalid vote" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const column = vote_type === "up" ? "votes_up" : "votes_down";

        // Get current value
        const { data: current } = await supabase
          .from("canal_status")
          .select(column)
          .eq("channel_name", channel_name)
          .maybeSingle();

        if (!current) {
          return new Response(
            JSON.stringify({ error: "Channel not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const newValue = ((current as Record<string, number>)[column] || 0) + 1;

        const { error } = await supabase
          .from("canal_status")
          .update({ [column]: newValue, updated_at: new Date().toISOString() })
          .eq("channel_name", channel_name);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, channel_name, [column]: newValue }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Unknown action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Votes] Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
