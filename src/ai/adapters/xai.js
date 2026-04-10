module.exports = function createXAIAdapter(config) {
  return {
    name: "xai",
    config: config || {},
    async query() {
      throw new Error("xAI adapter stub: not implemented");
    }
  };
};
