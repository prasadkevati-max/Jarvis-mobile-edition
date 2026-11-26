
'use strict';

// PRASSHU OFFLINE AI

let offlineModel = null;
let modelLoading = false;

async function loadOfflineAI() {

  if (offlineModel) return offlineModel;

  if (modelLoading) {
    throw new Error("AI is already loading");
  }

  modelLoading = true;

  try {
    const { pipeline, env } =
      await import(
        'https://cdn.jsdelivr.net/npm/@huggingface/transformers'
      );

    env.allowRemoteModels = true;

    offlineModel = await pipeline(
      'text-generation',
      'onnx-community/Qwen2.5-0.5B-Instruct',
      {
        dtype: 'q4'
      }
    );

    return offlineModel;

  } finally {
    modelLoading = false;
  }
}


// Ask Offline AI

async function askOfflineAI(question) {

  const ai = await loadOfflineAI();

  const result = await ai(question, {
    max_new_tokens: 150
  });

  return result[0].generated_text;
}

console.log("PRASSHU OFFLINE AI MODULE READY");
