#!/bin/bash
# Kill existing instances
for p in 8090 8091 8092 8093; do
  kill $(lsof -ti:$p) 2>/dev/null
done
sleep 2

# Instance 1: Gemma 4 A4B 26B (heavy, 12 threads)
nohup /opt/llama/llama-server -m /root/blun/models/gemma-4-26B-A4B-it-UD-Q4_K_M.gguf --port 8090 --host 127.0.0.1 -c 8192 -t 12 --parallel 2 > /var/log/llama-8090.log 2>&1 &

# Instance 2: DeepSeek 8B (medium, 4 threads)
nohup /opt/llama/llama-server -m /root/blun/models/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf --port 8091 --host 127.0.0.1 -c 8192 -t 4 --parallel 2 > /var/log/llama-8091.log 2>&1 &

# Instance 3: Llama 3.1 8B (medium, 4 threads)
nohup /opt/llama/llama-server -m /root/blun/models/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf --port 8092 --host 127.0.0.1 -c 8192 -t 4 --parallel 2 > /var/log/llama-8092.log 2>&1 &

# Instance 4: Gemma 3 4B (fast, 4 threads)
nohup /opt/llama/llama-server -m /root/blun/models/google_gemma-3-4b-it-Q4_K_M.gguf --port 8093 --host 127.0.0.1 -c 8192 -t 4 --parallel 2 > /var/log/llama-8093.log 2>&1 &

echo 'LLM Cluster started: 4 instances on 8090-8093'
