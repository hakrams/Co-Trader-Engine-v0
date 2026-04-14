const express = require("express");
const path = require("path");

const app = express();
const PORT = 4000;

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Co-Trader Engine V0 running on http://0.0.0.0:${PORT}`);
});