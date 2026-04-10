module.exports = function createMistralAdapter(config) {
  return {
    name: "mistral",
    config: config || {},
    async query() {
      throw new Error("Mistral adapter stub: not implemented");
    }
  };
};
