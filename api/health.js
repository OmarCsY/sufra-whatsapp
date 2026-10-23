module.exports = (req, res) => {
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({ ai: !!process.env.GEMINI_API_KEY, engine: !!process.env.N8N_WEBHOOK_URL });
};
