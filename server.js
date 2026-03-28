const express = require("express");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(bodyParser.json());

const supabase = createClient(
  "https://zrunitkoovylywtozxql.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpydW5pdGtvb3Z5bHl3dG96eHFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY1NTkwMywiZXhwIjoyMDg3MjMxOTAzfQ.Y9Eff40MxA6rS4HBjJ7fpAlPA9CPPnvRbnYIQTtDvfo"
);

app.post("/webhook", async (req, res) => {
  const body = req.body;

  const event = body.meta?.event_name;
  const userId = body.meta?.custom_data?.user_id;

  console.log("Webhook:", event, userId);

  if (!userId) return res.status(400).send("No user");

  if (event === "subscription_created" || event === "subscription_updated") {
    await supabase
      .from("chomeExstensionSettings")
      .update({ is_pro: true })
      .eq("user_id", userId);
  }

  if (event === "subscription_cancelled") {
    await supabase
      .from("chomeExstensionSettings")
      .update({ is_pro: false })
      .eq("user_id", userId);
  }

  res.send("ok");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});