// BLUN — Local AI Model Registry (GGUF / llama.cpp)

var MODELS = [
  {
    id: "gemma-3-4b",
    name: "Gemma 3",
    maker: "Google",
    description: "Fast and lightweight. Good for quick questions and everyday tasks.",
    size: "S",
    sizeGB: "3.0 GB",
    ram: "4 GB",
    category: "general",
    tags: ["fast", "lightweight"],
    filename: "gemma-3-4b-it-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf"
  },
  {
    id: "llama-3.2-3b",
    name: "Llama 3.2",
    maker: "Meta",
    description: "Small but capable. Great for chatting and simple tasks.",
    size: "S",
    sizeGB: "2.0 GB",
    ram: "4 GB",
    category: "general",
    tags: ["fast", "chat"],
    filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
  },
  {
    id: "phi-4-mini",
    name: "Phi-4 Mini",
    maker: "Microsoft",
    description: "Compact and smart. Handles reasoning and math well for its size.",
    size: "S",
    sizeGB: "2.5 GB",
    ram: "4 GB",
    category: "reasoning",
    tags: ["reasoning", "compact"],
    filename: "Phi-4-mini-instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf"
  },
  {
    id: "qwen3-4b",
    name: "Qwen 3",
    maker: "Alibaba",
    description: "Versatile all-rounder. Good at thinking step by step.",
    size: "S",
    sizeGB: "2.7 GB",
    ram: "4 GB",
    category: "general",
    tags: ["reasoning", "multilingual"],
    filename: "Qwen3-4B-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf"
  },
  {
    id: "mistral-7b",
    name: "Mistral",
    maker: "Mistral AI",
    description: "Reliable and balanced. One of the most popular models worldwide.",
    size: "M",
    sizeGB: "4.1 GB",
    ram: "8 GB",
    category: "general",
    tags: ["popular", "balanced"],
    filename: "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf"
  },
  {
    id: "gemma-3-12b",
    name: "Gemma 3 Medium",
    maker: "Google",
    description: "Smarter version of Gemma. Better answers, still reasonably fast.",
    size: "M",
    sizeGB: "8.1 GB",
    ram: "10 GB",
    category: "general",
    tags: ["quality", "versatile"],
    filename: "gemma-3-12b-it-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-Q4_K_M.gguf"
  },
  {
    id: "deepseek-r1-8b",
    name: "DeepSeek R1",
    maker: "DeepSeek",
    description: "Thinking model. Shows its reasoning process step by step.",
    size: "M",
    sizeGB: "4.9 GB",
    ram: "8 GB",
    category: "reasoning",
    tags: ["reasoning", "chain-of-thought"],
    filename: "DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf"
  },
  {
    id: "llama-3.1-8b",
    name: "Llama 3.1",
    maker: "Meta",
    description: "Strong all-purpose model. Great for writing, coding, and analysis.",
    size: "M",
    sizeGB: "4.7 GB",
    ram: "8 GB",
    category: "general",
    tags: ["versatile", "coding"],
    filename: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf"
  },
  {
    id: "qwen2.5-coder-7b",
    name: "Qwen Coder",
    maker: "Alibaba",
    description: "Built specifically for writing and understanding code.",
    size: "M",
    sizeGB: "4.7 GB",
    ram: "8 GB",
    category: "coding",
    tags: ["coding", "technical"],
    filename: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf"
  },
  {
    id: "codellama-7b",
    name: "Code Llama",
    maker: "Meta",
    description: "Specialized for programming. Understands many languages.",
    size: "M",
    sizeGB: "3.8 GB",
    ram: "8 GB",
    category: "coding",
    tags: ["coding", "programming"],
    filename: "CodeLlama-7B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/CodeLlama-7B-Instruct-GGUF/resolve/main/CodeLlama-7B-Instruct-Q4_K_M.gguf"
  },
  {
    id: "llama-3.3-70b",
    name: "Llama 3.3 Large",
    maker: "Meta",
    description: "Top-tier quality. Best answers but needs a powerful machine.",
    size: "XL",
    sizeGB: "43 GB",
    ram: "48 GB",
    category: "general",
    tags: ["best", "powerful"],
    filename: "Llama-3.3-70B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Llama-3.3-70B-Instruct-GGUF/resolve/main/Llama-3.3-70B-Instruct-Q4_K_M.gguf"
  },
  {
    id: "deepseek-r1-70b",
    name: "DeepSeek R1 Large",
    maker: "DeepSeek",
    description: "Advanced reasoning at the highest level. For complex problems.",
    size: "XL",
    sizeGB: "43 GB",
    ram: "48 GB",
    category: "reasoning",
    tags: ["reasoning", "advanced"],
    filename: "DeepSeek-R1-Distill-Llama-70B-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Llama-70B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-70B-Q4_K_M.gguf"
  }
];

function getAll() { return MODELS; }
function getById(id) { return MODELS.find(function(m) { return m.id === id; }); }

module.exports = { MODELS: MODELS, getAll: getAll, getById: getById };
