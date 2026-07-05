const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const ARK_MODEL_ID = process.env.ARK_MODEL_ID || "doubao-seedance-2-0-fast-260128";

const DEMO_VIDEO_URL = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

function hasSeedance() {
  return Boolean(ARK_API_KEY);
}

function normalizeTaskStatus(status) {
  const normalized = String(status || "").toLowerCase();

  if (["queued", "pending", "created", "submitted"].includes(normalized)) {
    return "queued";
  }

  if (["running", "processing", "in_progress"].includes(normalized)) {
    return "running";
  }

  if (["succeeded", "success", "completed", "done"].includes(normalized)) {
    return "succeeded";
  }

  if (["failed", "error", "expired", "cancelled", "canceled", "rejected"].includes(normalized)) {
    return "failed";
  }

  return normalized || "running";
}

function formatSeedanceError(error) {
  const code = error?.code || "";
  const message = error?.message || "";

  if (code === "InputImageSensitiveContentDetected.PrivacyInformation") {
    return "输入图片疑似包含真人或隐私信息，当前版本暂不支持这类素材。请改用非真人图片测试。";
  }

  if (code === "OutputVideoSensitiveContentDetected.PolicyViolation") {
    return "生成结果被平台策略拦截，疑似涉及版权或受限内容。请更换非知名角色、非受版权保护的图片或提示词后重试。";
  }

  return message;
}

function getResultVideoUrl(payload) {
  if (payload?.content?.video_url) return payload.content.video_url;
  if (Array.isArray(payload?.content)) {
    const videoItem = payload.content.find((item) => item?.video_url);
    if (videoItem?.video_url) return videoItem.video_url;
  }
  return "";
}

async function createSeedanceTask({ imageDataUrl, style, prompt }) {
  if (!hasSeedance()) {
    return { providerTaskId: `mock-${Date.now()}`, mock: true };
  }

  const finalPrompt = prompt || "";

  const response = await fetch(`${ARK_BASE_URL}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ARK_API_KEY}`
    },
    body: JSON.stringify({
      model: ARK_MODEL_ID,
      content: [
        {
          type: "image_url",
          role: "first_frame",
          image_url: {
            url: imageDataUrl
          }
        },
        {
          type: "text",
          text: finalPrompt
        }
      ],
      ratio: "16:9",
      resolution: "720p",
      duration: 5,
      generate_audio: false
    })
  });

  if (!response.ok) {
    throw new Error(`Seedance create failed: ${await response.text()}`);
  }

  const payload = await response.json();
  return {
    providerTaskId: payload.id,
    mock: false
  };
}

async function querySeedanceTask(providerTaskId) {
  if (!hasSeedance() || providerTaskId.startsWith("mock-")) {
    return {
      status: "succeeded",
      resultVideoUrl: DEMO_VIDEO_URL
    };
  }

  const response = await fetch(`${ARK_BASE_URL}/contents/generations/tasks/${providerTaskId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ARK_API_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Seedance query failed: ${await response.text()}`);
  }

  const payload = await response.json();
  return {
    status: normalizeTaskStatus(payload.status),
    resultVideoUrl: getResultVideoUrl(payload),
    errorMessage: formatSeedanceError(payload.error),
    rawStatus: payload.status || ""
  };
}

module.exports = {
  createSeedanceTask,
  querySeedanceTask,
  hasSeedance
};
