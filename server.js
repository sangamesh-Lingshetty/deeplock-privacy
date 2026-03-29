const express = require("express");

const app = express();

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    message:
      "DeepLock billing now runs through Supabase Edge Functions. See PAYMENTS_SETUP.md for production setup.",
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`DeepLock local helper listening on port ${port}`);
});
