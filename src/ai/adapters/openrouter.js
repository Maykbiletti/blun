module.exports = function createOpenRouterAdapter(config) {
  return {
    name: "openrouter",
    config: config || {},
    async query() {
      throw new Error("OpenRouter adapter stub: not implemented");
    }
  };
};
