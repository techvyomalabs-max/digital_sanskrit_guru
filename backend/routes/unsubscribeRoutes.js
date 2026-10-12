const express = require("express");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { verifyUnsubscribe } = require("../utils/unsubscribe");
const { perWorker } = require("../utils/workerCount");

const router = express.Router();

const unsubscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: perWorker(30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many unsubscribe requests. Please try again later." }
});

router.use(unsubscribeLimiter);

const esc = (s) =>
  String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

function renderPage({ title, heading, message, formHtml = "" }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f8fafc;
      color: #1e293b;
      padding: 16px;
    }
    .card {
      background: #ffffff;
      padding: 36px 32px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.06);
      max-width: 460px;
      width: 100%;
      text-align: center;
      border: 1px solid #e2e8f0;
    }
    h2 { margin: 0 0 12px 0; color: #0f172a; font-size: 22px; }
    p { margin: 0 0 20px 0; color: #475569; font-size: 15px; line-height: 1.5; }
    button {
      background-color: #e11d48;
      color: #ffffff;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.15s;
    }
    button:hover { background-color: #be123c; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${esc(heading)}</h2>
    <p>${esc(message)}</p>
    ${formHtml}
  </div>
</body>
</html>`;
}

router.get("/", (req, res) => {
  const u = String(req.query.u || "").trim();
  const s = String(req.query.s || "").trim();

  if (!verifyUnsubscribe(u, s)) {
    return res.status(400).send(
      renderPage({
        title: "Invalid Link — Digital Sanskrit Guru",
        heading: "Invalid Link",
        message: "This unsubscribe link is invalid or expired."
      })
    );
  }

  const formHtml = `
    <form method="POST">
      <input type="hidden" name="u" value="${esc(u)}" />
      <input type="hidden" name="s" value="${esc(s)}" />
      <button type="submit">Unsubscribe</button>
    </form>
  `;

  return res.status(200).send(
    renderPage({
      title: "Unsubscribe — Digital Sanskrit Guru",
      heading: "Unsubscribe",
      message: "Unsubscribe from Digital Sanskrit Guru marketing emails?",
      formHtml
    })
  );
});

router.post("/", async (req, res) => {
  const u = String(req.body?.u || req.query?.u || "").trim();
  const s = String(req.body?.s || req.query?.s || "").trim();

  if (!verifyUnsubscribe(u, s)) {
    return res.status(400).send(
      renderPage({
        title: "Invalid Link — Digital Sanskrit Guru",
        heading: "Invalid Link",
        message: "This unsubscribe link is invalid or expired."
      })
    );
  }

  try {
    await User.updateOne(
      { _id: u },
      { $set: { marketingOptOut: true, marketingOptOutAt: new Date() } }
    );

    return res.status(200).send(
      renderPage({
        title: "Unsubscribed — Digital Sanskrit Guru",
        heading: "Unsubscribed",
        message: "You have been unsubscribed. You will still receive order and account emails."
      })
    );
  } catch (err) {
    console.error("[Unsubscribe] Error updating user opt-out:", err);
    return res.status(500).send(
      renderPage({
        title: "Error — Digital Sanskrit Guru",
        heading: "Error",
        message: "Failed to process unsubscribe request. Please try again later."
      })
    );
  }
});

module.exports = router;
