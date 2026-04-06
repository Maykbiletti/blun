// BLUN - AI Organisator | MIT License

const Redis = require("ioredis");

const REDIS_URL = process.env.BLUN_REDIS_URL || "redis://127.0.0.1:6379";

const pub = new Redis(REDIS_URL);
const sub = new Redis(REDIS_URL);

pub.on("error", (err) => console.error("[redis:pub]", err.message));
sub.on("error", (err) => console.error("[redis:sub]", err.message));

function publish(channel, type, payload) {
  pub.publish(channel, JSON.stringify({ type, payload, ts: Date.now() }));
}

function broadcast(type, payload) {
  publish("blun:dashboard", type, payload);
}

module.exports = { pub, sub, publish, broadcast };
