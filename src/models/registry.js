// BLUN — Local AI Model Registry (GGUF / llama.cpp)
// 55+ models, sorted by maker then size ascending

var MODELS = [

  // ========== 01.AI ==========
  {
    id: "yi-1.5-9b",
    name: "Yi 1.5",
    maker: "01.AI",
    description: "Strong bilingual model (English and Chinese). Good at writing and analysis.",
    size: "M",
    sizeGB: "5.5 GB",
    ram: "8 GB",
    category: "general",
    tags: ["multilingual", "quality"],
    filename: "Yi-1.5-9B-Chat-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Yi-1.5-9B-Chat-GGUF/resolve/main/Yi-1.5-9B-Chat-Q4_K_M.gguf"
  },
  {
    id: "yi-1.5-34b",
    name: "Yi 1.5 Large",
    maker: "01.AI",
    description: "Powerful Yi model. Excellent at complex tasks in English and Chinese.",
    size: "L",
    sizeGB: "20 GB",
    ram: "24 GB",
    category: "general",
    tags: ["multilingual", "powerful"],
    filename: "Yi-1.5-34B-Chat-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Yi-1.5-34B-Chat-GGUF/resolve/main/Yi-1.5-34B-Chat-Q4_K_M.gguf"
  },

  // ========== Alibaba ==========
  {
    id: "qwen3-4b",
    name: "Qwen 3",
    maker: "Alibaba",
    description: "Versatile all-rounder from China. Good at thinking step by step in many languages.",
    size: "S",
    sizeGB: "2.7 GB",
    ram: "4 GB",
    category: "general",
    tags: ["reasoning", "multilingual"],
    filename: "Qwen3-4B-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf"
  },
  {
    id: "qwen2.5-7b",
    name: "Qwen 2.5",
    maker: "Alibaba",
    description: "Reliable everyday model. Handles writing, questions, and conversations well.",
    size: "M",
    sizeGB: "4.7 GB",
    ram: "8 GB",
    category: "general",
    tags: ["versatile", "multilingual"],
    filename: "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf"
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
    id: "qwen2.5-14b",
    name: "Qwen 2.5 Medium",
    maker: "Alibaba",
    description: "Smarter Qwen with deeper understanding. Great balance of speed and quality.",
    size: "M",
    sizeGB: "8.9 GB",
    ram: "12 GB",
    category: "general",
    tags: ["quality", "multilingual"],
    filename: "Qwen2.5-14B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf"
  },
  {
    id: "qwen2.5-coder-32b",
    name: "Qwen Coder Large",
    maker: "Alibaba",
    description: "Top-tier coding model. Writes, reviews, and fixes code like a senior developer.",
    size: "L",
    sizeGB: "20 GB",
    ram: "24 GB",
    category: "coding",
    tags: ["coding", "powerful"],
    filename: "Qwen2.5-Coder-32B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Qwen2.5-Coder-32B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-32B-Instruct-Q4_K_M.gguf"
  },
  {
    id: "qwq-32b",
    name: "QwQ",
    maker: "Alibaba",
    description: "Thinking model that reasons through problems out loud. Excellent at math and logic.",
    size: "L",
    sizeGB: "20 GB",
    ram: "24 GB",
    category: "reasoning",
    tags: ["reasoning", "chain-of-thought", "math"],
    filename: "QwQ-32B-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/QwQ-32B-GGUF/resolve/main/QwQ-32B-Q4_K_M.gguf"
  },
  {
    id: "qwen2.5-72b",
    name: "Qwen 2.5 Large",
    maker: "Alibaba",
    description: "Most powerful Qwen. Rivals the best commercial models in quality.",
    size: "XL",
    sizeGB: "44 GB",
    ram: "48 GB",
    category: "general",
    tags: ["powerful", "multilingual", "best"],
    filename: "Qwen2.5-72B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Qwen2.5-72B-Instruct-GGUF/resolve/main/Qwen2.5-72B-Instruct-Q4_K_M.gguf"
  },

  // ========== BigCode ==========
  {
    id: "starcoder2-7b",
    name: "StarCoder2",
    maker: "BigCode",
    description: "Open-source code model. Trained on millions of code repositories.",
    size: "M",
    sizeGB: "4.0 GB",
    ram: "8 GB",
    category: "coding",
    tags: ["coding", "open-source"],
    filename: "starcoder2-7b-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/starcoder2-7b-GGUF/resolve/main/starcoder2-7b-Q4_K_M.gguf"
  },
  {
    id: "starcoder2-15b",
    name: "StarCoder2 Large",
    maker: "BigCode",
    description: "Bigger StarCoder. Better at complex coding tasks and understanding full projects.",
    size: "M",
    sizeGB: "9.0 GB",
    ram: "12 GB",
    category: "coding",
    tags: ["coding", "powerful"],
    filename: "starcoder2-15b-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/starcoder2-15b-GGUF/resolve/main/starcoder2-15b-Q4_K_M.gguf"
  },

  // ========== Cognitive Computations ==========
  {
    id: "dolphin-2.6-mistral",
    name: "Dolphin Mistral",
    maker: "Cognitive Computations",
    description: "Uncensored and helpful. Based on Mistral with no content filters.",
    size: "M",
    sizeGB: "4.1 GB",
    ram: "8 GB",
    category: "general",
    tags: ["uncensored", "chat"],
    filename: "dolphin-2.6-mistral-7b-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/dolphin-2.6-mistral-7b-GGUF/resolve/main/dolphin-2.6-mistral-7b-Q4_K_M.gguf"
  },
  {
    id: "dolphin-2.9-llama3-8b",
    name: "Dolphin Llama 3",
    maker: "Cognitive Computations",
    description: "Uncensored Llama 3. Answers anything without restrictions.",
    size: "M",
    sizeGB: "4.7 GB",
    ram: "8 GB",
    category: "general",
    tags: ["uncensored", "chat"],
    filename: "dolphin-2.9-llama3-8b-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/dolphin-2.9-llama3-8b-GGUF/resolve/main/dolphin-2.9-llama3-8b-Q4_K_M.gguf"
  },

  // ========== Cohere ==========
  {
    id: "command-r-35b",
    name: "Command R",
    maker: "Cohere",
    description: "Great at following instructions and searching through documents. Built for real work.",
    size: "L",
    sizeGB: "21 GB",
    ram: "24 GB",
    category: "general",
    tags: ["instructions", "retrieval"],
    filename: "c4ai-command-r-v01-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/c4ai-command-r-v01-GGUF/resolve/main/c4ai-command-r-v01-Q4_K_M.gguf"
  },

  // ========== DeepSeek ==========
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
    id: "deepseek-coder-v2",
    name: "DeepSeek Coder V2",
    maker: "DeepSeek",
    description: "Coding specialist from DeepSeek. Understands complex codebases and writes clean code.",
    size: "M",
    sizeGB: "9.4 GB",
    ram: "12 GB",
    category: "coding",
    tags: ["coding", "technical"],
    filename: "DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF/resolve/main/DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf"
  },
  {
    id: "deepseek-r1-70b",
    name: "DeepSeek R1 Large",
    maker: "DeepSeek",
    description: "Advanced reasoning at the highest level. For complex problems and deep analysis.",
    size: "XL",
    sizeGB: "43 GB",
    ram: "48 GB",
    category: "reasoning",
    tags: ["reasoning", "advanced", "powerful"],
    filename: "DeepSeek-R1-Distill-Llama-70B-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Llama-70B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-70B-Q4_K_M.gguf"
  },

  // ========== Google ==========
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
    filename: "google_gemma-3-4b-it-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/google_gemma-3-4b-it-GGUF/resolve/main/google_gemma-3-4b-it-Q4_K_M.gguf"
  },
  {
    id: "gemma-2-9b",
    name: "Gemma 2",
    maker: "Google",
    description: "Solid mid-size model. Great quality for its small download size.",
    size: "M",
    sizeGB: "5.5 GB",
    ram: "8 GB",
    category: "general",
    tags: ["balanced", "quality"],
    filename: "gemma-2-9b-it-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/main/gemma-2-9b-it-Q4_K_M.gguf"
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
    filename: "google_gemma-3-12b-it-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/google_gemma-3-12b-it-GGUF/resolve/main/google_gemma-3-12b-it-Q4_K_M.gguf"
  },
  {
    id: "gemma-4-12b",
    name: "Gemma 4",
    maker: "Google",
    description: "Google newest AI. Excellent at reasoning, coding, and conversations.",
    size: "M",
    sizeGB: "8.5 GB",
    ram: "12 GB",
    category: "general",
    tags: ["new", "reasoning", "coding"],
    filename: "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/gemma-4-26B-A4B-it-UD-Q4_K_M.gguf"
  },
  
  {
    id: "gemma-3-27b",
    name: "Gemma 3 Large",
    maker: "Google",
    description: "Largest Gemma 3. Excellent at complex tasks, multilingual, and long context.",
    size: "L",
    sizeGB: "16 GB",
    ram: "20 GB",
    category: "general",
    tags: ["powerful", "multilingual", "quality"],
    filename: "google_gemma-3-27b-it-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/google_gemma-3-27b-it-GGUF/resolve/main/google_gemma-3-27b-it-Q4_K_M.gguf"
  },
  {
    id: "gemma-2-27b",
    name: "Gemma 2 Large",
    maker: "Google",
    description: "Powerful Gemma 2. Excellent writing and reasoning for its generation.",
    size: "L",
    sizeGB: "16 GB",
    ram: "20 GB",
    category: "general",
    tags: ["powerful", "quality"],
    filename: "gemma-2-27b-it-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/gemma-2-27b-it-GGUF/resolve/main/gemma-2-27b-it-Q4_K_M.gguf"
  },
  {
    id: "gemma-4-27b",
    name: "Gemma 4 Large",
    maker: "Google",
    description: "Most powerful Gemma. Best at complex reasoning, long documents, and professional coding.",
    size: "L",
    sizeGB: "18 GB",
    ram: "24 GB",
    category: "general",
    tags: ["new", "powerful", "reasoning", "coding"],
    filename: "gemma-4-31B-it-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/unsloth/gemma-4-31B-it-GGUF/resolve/main/gemma-4-31B-it-Q4_K_M.gguf"
  },

  // ========== Intel ==========
  {
    id: "neural-chat-7b",
    name: "Neural Chat",
    maker: "Intel",
    description: "Intel conversational model. Good at friendly, helpful dialogue.",
    size: "M",
    sizeGB: "4.1 GB",
    ram: "8 GB",
    category: "general",
    tags: ["chat", "friendly"],
    filename: "neural-chat-7b-v3-3-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/neural-chat-7b-v3-3-GGUF/resolve/main/neural-chat-7b-v3-3-Q4_K_M.gguf"
  },

  // ========== LMSYS ==========
  {
    id: "vicuna-7b",
    name: "Vicuna",
    maker: "LMSYS",
    description: "Classic fine-tuned chat model. One of the first good open-source assistants.",
    size: "M",
    sizeGB: "3.8 GB",
    ram: "8 GB",
    category: "general",
    tags: ["chat", "classic"],
    filename: "vicuna-7b-v1.5-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/vicuna-7b-v1.5-GGUF/resolve/main/vicuna-7b-v1.5-Q4_K_M.gguf"
  },
  {
    id: "vicuna-13b",
    name: "Vicuna Medium",
    maker: "LMSYS",
    description: "Bigger Vicuna. Noticeably smarter responses for conversations and writing.",
    size: "M",
    sizeGB: "7.9 GB",
    ram: "10 GB",
    category: "general",
    tags: ["chat", "quality"],
    filename: "vicuna-13b-v1.5-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/vicuna-13b-v1.5-GGUF/resolve/main/vicuna-13b-v1.5-Q4_K_M.gguf"
  },

  // ========== Meta ==========
  {
    id: "llama-3.2-3b",
    name: "Llama 3.2",
    maker: "Meta",
    description: "Small but capable. Great for chatting and simple tasks.",
    size: "S",
    sizeGB: "2.0 GB",
    ram: "4 GB",
    category: "general",
    tags: ["fast", "chat", "small"],
    filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
  },
  {
    id: "codellama-7b",
    name: "Code Llama",
    maker: "Meta",
    description: "Specialized for programming. Understands many coding languages.",
    size: "M",
    sizeGB: "3.8 GB",
    ram: "8 GB",
    category: "coding",
    tags: ["coding", "programming"],
    filename: "CodeLlama-7B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/CodeLlama-7B-Instruct-GGUF/resolve/main/CodeLlama-7B-Instruct-Q4_K_M.gguf"
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
    tags: ["versatile", "coding", "popular"],
    filename: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf"
  },
  {
    id: "codellama-34b",
    name: "Code Llama Large",
    maker: "Meta",
    description: "Powerful code model. Writes complex programs and understands large codebases.",
    size: "L",
    sizeGB: "20 GB",
    ram: "24 GB",
    category: "coding",
    tags: ["coding", "powerful"],
    filename: "CodeLlama-34B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/CodeLlama-34B-Instruct-GGUF/resolve/main/CodeLlama-34B-Instruct-Q4_K_M.gguf"
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
    id: "llama-3.1-70b",
    name: "Llama 3.1 Large",
    maker: "Meta",
    description: "Massive Llama model. Exceptional at everything but needs serious hardware.",
    size: "XL",
    sizeGB: "43 GB",
    ram: "48 GB",
    category: "general",
    tags: ["powerful", "versatile"],
    filename: "Meta-Llama-3.1-70B-Instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Meta-Llama-3.1-70B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-70B-Instruct-Q4_K_M.gguf"
  },

  // ========== Microsoft ==========
  {
    id: "phi-3-mini",
    name: "Phi-3 Mini",
    maker: "Microsoft",
    description: "Tiny but surprisingly capable. Great for devices with limited memory.",
    size: "S",
    sizeGB: "2.2 GB",
    ram: "4 GB",
    category: "general",
    tags: ["small", "efficient"],
    filename: "Phi-3-mini-4k-instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Phi-3-mini-4k-instruct-GGUF/resolve/main/Phi-3-mini-4k-instruct-Q4_K_M.gguf"
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
    tags: ["reasoning", "compact", "small"],
    filename: "Phi-4-mini-instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf"
  },
  {
    id: "orca-2-7b",
    name: "Orca 2",
    maker: "Microsoft",
    description: "Trained to think carefully before answering. Good at step-by-step reasoning.",
    size: "M",
    sizeGB: "4.1 GB",
    ram: "8 GB",
    category: "reasoning",
    tags: ["reasoning", "careful"],
    filename: "Orca-2-7b-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Orca-2-7b-GGUF/resolve/main/Orca-2-7b-Q4_K_M.gguf"
  },
  {
    id: "orca-2-13b",
    name: "Orca 2 Medium",
    maker: "Microsoft",
    description: "Larger Orca with stronger reasoning. Thinks through problems more thoroughly.",
    size: "M",
    sizeGB: "7.9 GB",
    ram: "10 GB",
    category: "reasoning",
    tags: ["reasoning", "quality"],
    filename: "Orca-2-13b-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Orca-2-13b-GGUF/resolve/main/Orca-2-13b-Q4_K_M.gguf"
  },
  {
    id: "phi-3-medium",
    name: "Phi-3 Medium",
    maker: "Microsoft",
    description: "Larger Phi model. Better answers for math, science, and logical problems.",
    size: "M",
    sizeGB: "8.0 GB",
    ram: "12 GB",
    category: "reasoning",
    tags: ["reasoning", "math", "science"],
    filename: "Phi-3-medium-4k-instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Phi-3-medium-4k-instruct-GGUF/resolve/main/Phi-3-medium-4k-instruct-Q4_K_M.gguf"
  },

  // ========== Mistral AI ==========
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
    id: "codestral-22b",
    name: "Codestral",
    maker: "Mistral AI",
    description: "Mistral dedicated coding model. Trained specifically to write and fix code.",
    size: "L",
    sizeGB: "13 GB",
    ram: "16 GB",
    category: "coding",
    tags: ["coding", "new"],
    filename: "Codestral-22B-v0.1-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Codestral-22B-v0.1-GGUF/resolve/main/Codestral-22B-v0.1-Q4_K_M.gguf"
  },
  {
    id: "mistral-small-22b",
    name: "Mistral Small",
    maker: "Mistral AI",
    description: "Smarter Mistral. Better at complex tasks while staying relatively lightweight.",
    size: "L",
    sizeGB: "13 GB",
    ram: "16 GB",
    category: "general",
    tags: ["quality", "versatile"],
    filename: "Mistral-Small-Instruct-2409-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Mistral-Small-Instruct-2409-GGUF/resolve/main/Mistral-Small-Instruct-2409-Q4_K_M.gguf"
  },
  {
    id: "mixtral-8x7b",
    name: "Mixtral",
    maker: "Mistral AI",
    description: "Uses multiple expert networks. Fast responses with near-large-model quality.",
    size: "XL",
    sizeGB: "26 GB",
    ram: "32 GB",
    category: "general",
    tags: ["powerful", "expert-mix"],
    filename: "Mixtral-8x7B-Instruct-v0.1-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Mixtral-8x7B-Instruct-v0.1-GGUF/resolve/main/Mixtral-8x7B-Instruct-v0.1-Q4_K_M.gguf"
  },

  // ========== Nous Research ==========
  {
    id: "nous-hermes-2-mistral",
    name: "Nous Hermes 2 Mistral",
    maker: "Nous Research",
    description: "Fine-tuned Mistral for better instruction following. Very helpful and detailed.",
    size: "M",
    sizeGB: "4.1 GB",
    ram: "8 GB",
    category: "general",
    tags: ["instructions", "helpful"],
    filename: "Nous-Hermes-2-Mistral-7B-DPO-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Nous-Hermes-2-Mistral-7B-DPO-GGUF/resolve/main/Nous-Hermes-2-Mistral-7B-DPO-Q4_K_M.gguf"
  },
  {
    id: "nous-hermes-2-llama",
    name: "Nous Hermes 2 Llama",
    maker: "Nous Research",
    description: "Fine-tuned Llama for better conversations. Follows instructions precisely.",
    size: "M",
    sizeGB: "4.7 GB",
    ram: "8 GB",
    category: "general",
    tags: ["instructions", "chat"],
    filename: "Nous-Hermes-2-Llama-3-8B-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/Nous-Hermes-2-Llama-3-8B-GGUF/resolve/main/Nous-Hermes-2-Llama-3-8B-Q4_K_M.gguf"
  },

  // ========== OpenChat ==========
  {
    id: "openchat-3.5-7b",
    name: "OpenChat 3.5",
    maker: "OpenChat",
    description: "Trained with a clever mixed-quality approach. Surprisingly good chat quality.",
    size: "M",
    sizeGB: "4.1 GB",
    ram: "8 GB",
    category: "general",
    tags: ["chat", "quality"],
    filename: "openchat-3.5-0106-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/openchat-3.5-0106-GGUF/resolve/main/openchat-3.5-0106-Q4_K_M.gguf"
  },

  // ========== Shanghai AI Lab ==========
  {
    id: "internlm2.5-7b",
    name: "InternLM 2.5",
    maker: "Shanghai AI Lab",
    description: "Strong Chinese-English model. Good at math, coding, and tool use.",
    size: "M",
    sizeGB: "4.7 GB",
    ram: "8 GB",
    category: "general",
    tags: ["multilingual", "math", "coding"],
    filename: "internlm2_5-7b-chat-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/internlm2_5-7b-chat-GGUF/resolve/main/internlm2_5-7b-chat-Q4_K_M.gguf"
  },

  // ========== Stability AI ==========
  {
    id: "stablelm-2-1.6b",
    name: "StableLM 2",
    maker: "Stability AI",
    description: "Extremely small model. Runs on almost anything, good for basic tasks.",
    size: "S",
    sizeGB: "1.0 GB",
    ram: "2 GB",
    category: "general",
    tags: ["tiny", "fast", "small"],
    filename: "stablelm-2-1_6b-chat-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/stablelm-2-1_6b-chat-GGUF/resolve/main/stablelm-2-1_6b-chat-Q4_K_M.gguf"
  },
  {
    id: "stablelm-zephyr-3b",
    name: "StableLM Zephyr",
    maker: "Stability AI",
    description: "Small and chatty. Tuned for friendly, helpful conversations.",
    size: "S",
    sizeGB: "1.8 GB",
    ram: "3 GB",
    category: "general",
    tags: ["small", "chat", "fast"],
    filename: "stablelm-zephyr-3b-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/stablelm-zephyr-3b-GGUF/resolve/main/stablelm-zephyr-3b-Q4_K_M.gguf"
  },

  // ========== TII ==========
  {
    id: "falcon-7b",
    name: "Falcon",
    maker: "TII",
    description: "Built by UAE researchers. Good general knowledge and conversation skills.",
    size: "M",
    sizeGB: "4.1 GB",
    ram: "8 GB",
    category: "general",
    tags: ["chat", "general"],
    filename: "falcon-7b-instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/falcon-7b-instruct-GGUF/resolve/main/falcon-7b-instruct-Q4_K_M.gguf"
  },
  {
    id: "falcon-40b",
    name: "Falcon Large",
    maker: "TII",
    description: "Powerful Falcon model. Strong at knowledge-heavy tasks and writing.",
    size: "XL",
    sizeGB: "24 GB",
    ram: "32 GB",
    category: "general",
    tags: ["powerful", "knowledge"],
    filename: "falcon-40b-instruct-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/falcon-40b-instruct-GGUF/resolve/main/falcon-40b-instruct-Q4_K_M.gguf"
  },

  // ========== TinyLlama ==========
  {
    id: "tinyllama-1.1b",
    name: "TinyLlama",
    maker: "TinyLlama",
    description: "The smallest useful model. Perfect for testing or very low-end hardware.",
    size: "S",
    sizeGB: "0.7 GB",
    ram: "1 GB",
    category: "general",
    tags: ["tiny", "fast", "small"],
    filename: "TinyLlama-1.1B-Chat-v1.0-Q4_K_M.gguf",
    huggingface: "https://huggingface.co/bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/TinyLlama-1.1B-Chat-v1.0-Q4_K_M.gguf"
  }

];

function getAll() { return MODELS; }
function getById(id) { return MODELS.find(function(m) { return m.id === id; }); }
function getByCategory(cat) { return MODELS.filter(function(m) { return m.category === cat; }); }
function getByMaker(maker) { return MODELS.filter(function(m) { return m.maker === maker; }); }
function getBySize(size) { return MODELS.filter(function(m) { return m.size === size; }); }
function search(q) {
  var lower = q.toLowerCase();
  return MODELS.filter(function(m) {
    return m.name.toLowerCase().indexOf(lower) !== -1 ||
           m.maker.toLowerCase().indexOf(lower) !== -1 ||
           m.description.toLowerCase().indexOf(lower) !== -1 ||
           m.tags.some(function(t) { return t.indexOf(lower) !== -1; });
  });
}

module.exports = {
  MODELS: MODELS,
  getAll: getAll,
  getById: getById,
  getByCategory: getByCategory,
  getByMaker: getByMaker,
  getBySize: getBySize,
  search: search
};
