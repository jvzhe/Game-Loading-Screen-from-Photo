const memoryStore = global.__FRAME_MOTION_TASKS__ || new Map();

if (!global.__FRAME_MOTION_TASKS__) {
  global.__FRAME_MOTION_TASKS__ = memoryStore;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function hasSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function getHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
}

function sanitizeImageValue(imageValue) {
  if (!imageValue) return "missing";
  return imageValue.startsWith("data:image/") ? "inline-data-url" : imageValue;
}

async function createTaskRecord(task) {
  const record = {
    image_url: sanitizeImageValue(task.imageUrl),
    style: task.style,
    prompt: task.prompt || "",
    status: task.status || "queued",
    provider_task_id: task.providerTaskId || null,
    result_video_url: task.resultVideoUrl || null,
    error_message: task.errorMessage || null
  };

  if (!hasSupabase()) {
    const id = crypto.randomUUID();
    const localRecord = { id, created_at: new Date().toISOString(), ...record };
    memoryStore.set(id, localRecord);
    return localRecord;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/generation_tasks`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(record)
  });

  if (!response.ok) {
    throw new Error(`Supabase insert failed: ${await response.text()}`);
  }

  const [created] = await response.json();
  return created;
}

async function updateTaskRecord(id, patch) {
  const normalizedPatch = {};

  if (patch.status !== undefined) normalizedPatch.status = patch.status;
  if (patch.providerTaskId !== undefined) normalizedPatch.provider_task_id = patch.providerTaskId;
  if (patch.resultVideoUrl !== undefined) normalizedPatch.result_video_url = patch.resultVideoUrl;
  if (patch.errorMessage !== undefined) normalizedPatch.error_message = patch.errorMessage;

  if (!hasSupabase()) {
    const current = memoryStore.get(id);
    if (!current) return null;
    const next = { ...current, ...normalizedPatch };
    memoryStore.set(id, next);
    return next;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/generation_tasks?id=eq.${id}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(normalizedPatch)
  });

  if (!response.ok) {
    throw new Error(`Supabase update failed: ${await response.text()}`);
  }

  const [updated] = await response.json();
  return updated;
}

async function getTaskRecord(id) {
  if (!hasSupabase()) {
    return memoryStore.get(id) || null;
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/generation_tasks?id=eq.${id}&select=*`,
    {
      method: "GET",
      headers: getHeaders()
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase select failed: ${await response.text()}`);
  }

  const [record] = await response.json();
  return record || null;
}

module.exports = {
  createTaskRecord,
  updateTaskRecord,
  getTaskRecord,
  hasSupabase
};
