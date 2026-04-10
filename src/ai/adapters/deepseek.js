module.exports = function createDeepSeekAdapter(config) {
  return {
    name: "deepseek",
    config: config || {},
    async query() {
      throw new Error("DeepSeek adapter stub: not implemented");
    }
  };
};
