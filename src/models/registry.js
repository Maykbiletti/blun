// BLUN — Local AI Model Registry

var MODELS = [
  {
    id: "gemma3:4b",
    name: "Gemma 3",
    maker: "Google",
    description: "Fast and lightweight. Good for quick questions and everyday tasks.",
    size: "S",
    sizeGB: "3.3 GB",
    ram: "4 GB",
    category: "general",
    tags: ["fast", "lightweight"]
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2",
    maker: "Meta",
    description: "Small but capable. Great for chatting and simple tasks.",
    size: "S",
    sizeGB: "2.0 GB",
    ram: "4 GB",
    category: "general",
    tags: ["fast", "chat"]
  },
  {
    id: "phi4-mini",
    name: "Phi-4 Mini",
    maker: "Microsoft",
    description: "Compact and smart. Handles reasoning and math well for its size.",
    size: "S",
    sizeGB: "2.5 GB",
    ram: "4 GB",
    category: "reasoning",
    tags: ["reasoning", "compact"]
  },
  {
    id: "qwen3:4b",
    name: "Qwen 3",
    maker: "Alibaba",
    description: "Versatile all-rounder. Good at thinking step by step.",
    size: "S",
    sizeGB: "2.6 GB",
    ram: "4 GB",
    category: "general",
    tags: ["reasoning", "multilingual"]
  },
  {
    id: "mistral",
    name: "Mistral",
    maker: "Mistral AI",
    description: "Reliable and balanced. One of the most popular models worldwide.",
    size: "M",
    sizeGB: "4.1 GB",
    ram: "8 GB",
    category: "general",
    tags: ["popular", "balanced"]
  },
  {
    id: "gemma3:12b",
    name: "Gemma 3 Medium",
    maker: "Google",
    description: "Smarter version of Gemma. Better answers, still reasonably fast.",
    size: "M",
    sizeGB: "8.1 GB",
    ram: "10 GB",
    category: "general",
    tags: ["quality", "versatile"]
  },
  {
    id: "deepseek-r1:8b",
    name: "DeepSeek R1",
    maker: "DeepSeek",
    description: "Thinking model. Shows its reasoning process step by step.",
    size: "M",
    sizeGB: "4.9 GB",
    ram: "8 GB",
    category: "reasoning",
    tags: ["reasoning", "chain-of-thought"]
  },
  {
    id: "llama3.1:8b",
    name: "Llama 3.1",
    maker: "Meta",
    description: "Strong all-purpose model. Great for writing, coding, and analysis.",
    size: "M",
    sizeGB: "4.7 GB",
    ram: "8 GB",
    category: "general",
    tags: ["versatile", "coding"]
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen Coder",
    maker: "Alibaba",
    description: "Built specifically for writing and understanding code.",
    size: "M",
    sizeGB: "4.7 GB",
    ram: "8 GB",
    category: "coding",
    tags: ["coding", "technical"]
  },
  {
    id: "codellama:7b",
    name: "Code Llama",
    maker: "Meta",
    description: "Specialized for programming. Understands many languages.",
    size: "M",
    sizeGB: "3.8 GB",
    ram: "8 GB",
    category: "coding",
    tags: ["coding", "programming"]
  },
  {
    id: "llama3.3:70b",
    name: "Llama 3.3 Large",
    maker: "Meta",
    description: "Top-tier quality. Best answers but needs a powerful machine.",
    size: "XL",
    sizeGB: "43 GB",
    ram: "48 GB",
    category: "general",
    tags: ["best", "powerful"]
  },
  {
    id: "deepseek-r1:70b",
    name: "DeepSeek R1 Large",
    maker: "DeepSeek",
    description: "Advanced reasoning at the highest level. For complex problems.",
    size: "XL",
    sizeGB: "43 GB",
    ram: "48 GB",
    category: "reasoning",
    tags: ["reasoning", "advanced"]
  }
];

function getAll() { return MODELS; }
function getById(id) { return MODELS.find(function(m) { return m.id === id; }); }

module.exports = { MODELS: MODELS, getAll: getAll, getById: getById };
