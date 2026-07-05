const { getTaskRecord, updateTaskRecord } = require("../lib/supabase");
const { querySeedanceTask } = require("../lib/seedance");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const taskId = req.query.id;
    const record = await getTaskRecord(taskId);

    if (!record) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    if (record.status === "succeeded" || record.status === "failed") {
      res.status(200).json({
        taskId: record.id,
        status: record.status,
        resultVideoUrl: record.result_video_url || "",
        errorMessage: record.error_message || ""
      });
      return;
    }

    if (!record.provider_task_id) {
      res.status(200).json({
        taskId: record.id,
        status: record.status || "queued"
      });
      return;
    }

    const remoteStatus = await querySeedanceTask(record.provider_task_id);
    const nextStatus = remoteStatus.status || record.status || "running";

    if (nextStatus === "succeeded" || nextStatus === "failed") {
      await updateTaskRecord(record.id, {
        status: nextStatus,
        resultVideoUrl: remoteStatus.resultVideoUrl || "",
        errorMessage: remoteStatus.errorMessage || ""
      });
    } else if (nextStatus !== record.status) {
      await updateTaskRecord(record.id, { status: nextStatus });
    }

    res.status(200).json({
      taskId: record.id,
      status: nextStatus,
      resultVideoUrl: remoteStatus.resultVideoUrl || "",
      errorMessage: remoteStatus.errorMessage || ""
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to query task",
      detail: error.message
    });
  }
};
