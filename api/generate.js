const { createTaskRecord, updateTaskRecord } = require("./lib/supabase");
const { createSeedanceTask } = require("./lib/seedance");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { imageDataUrl, style, prompt } = req.body || {};

    if (!imageDataUrl || !style) {
      res.status(400).json({ error: "imageDataUrl and style are required" });
      return;
    }

    if (!imageDataUrl.startsWith("data:image/")) {
      res.status(400).json({ error: "Only inline image data URL is supported in MVP mode" });
      return;
    }

    const record = await createTaskRecord({
      imageUrl: imageDataUrl,
      style,
      prompt,
      status: "queued"
    });

    const seedanceTask = await createSeedanceTask({
      imageDataUrl,
      style,
      prompt
    });

    await updateTaskRecord(record.id, {
      status: seedanceTask.mock ? "running" : "queued",
      providerTaskId: seedanceTask.providerTaskId
    });

    res.status(200).json({
      taskId: record.id,
      status: seedanceTask.mock ? "running" : "queued"
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create generation task",
      detail: error.message
    });
  }
};
